package ee.forma;

import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BookingService {
  final JdbcTemplate db;
  static final ZoneId ZONE = ZoneId.of("Europe/Tallinn");

  public BookingService(JdbcTemplate db) {
    this.db = db;
  }

  public JdbcTemplate jdbc() {
    return db;
  }

  public static ResponseStatusException bad(String message) {
    return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
  }

  public Map<String, Object> company(String slug) {
    return db
        .queryForList(
            "select id,slug,name,category,city,description,address,opens,closes,weekdays,demo from"
                + " companies where slug=?",
            slug)
        .stream()
        .findFirst()
        .orElseThrow(
            () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Компания не найдена"));
  }

  public Map<String, Object> owned(String slug, String uid) {
    Map<String, Object> c = company(slug);
    if (db.queryForObject(
            "select count(*) from companies where id=? and owner_id=?",
            Integer.class,
            c.get("id"),
            uid)
        != 1)
      throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Нет доступа к этой компании");
    return c;
  }

  public List<Map<String, Object>> services(Object id) {
    return db.queryForList(
        "select id,name,description,duration,price from services where company_id=? and active=true"
            + " order by price,name",
        id);
  }

  public List<Map<String, Object>> staff(Object id) {
    return db.queryForList(
        "select id,name,role from staff where company_id=? and active=true order by name", id);
  }

  Map<String, Object> service(Object id, String sid) {
    return db
        .queryForList("select * from services where id=? and company_id=? and active=true", sid, id)
        .stream()
        .findFirst()
        .orElseThrow(() -> bad("Выберите доступную услугу"));
  }

  void checkStaff(Object id, String sid) {
    if (db.queryForObject(
            "select count(*) from staff where id=? and company_id=? and active=true",
            Integer.class,
            sid,
            id)
        != 1) throw bad("Выберите доступного специалиста");
  }

  void checkDate(LocalDate day) {
    LocalDate today = LocalDate.now(ZONE);
    if (day.isBefore(today) || day.isAfter(today.plusDays(60)))
      throw bad("Выберите дату в ближайшие 60 дней");
  }

  boolean working(Map<String, Object> c, LocalDate date) {
    return Arrays.asList(c.get("weekdays").toString().split(","))
        .contains("" + date.getDayOfWeek().getValue());
  }

  boolean available(Object cid, String staff, LocalDate date, int t, int duration) {
    return db.queryForObject(
            "select count(*) from bookings where company_id=? and staff_id=? and booking_date=? and"
                + " status='confirmed' and start_minute < ? and start_minute+duration > ?",
            Integer.class,
            cid,
            staff,
            date,
            t + duration,
            t)
        == 0;
  }

  boolean future(LocalDate d, int t) {
    return LocalDateTime.of(d, LocalTime.of(t / 60, t % 60)).isAfter(LocalDateTime.now(ZONE));
  }

  public List<Integer> slots(String slug, String sid, String staff, LocalDate day) {
    Map<String, Object> c = company(slug);
    checkDate(day);
    int duration = (int) service(c.get("id"), sid).get("duration");
    checkStaff(c.get("id"), staff);
    List<Integer> result = new ArrayList<>();
    if (!working(c, day)) return result;
    for (int t = (int) c.get("opens"); t + duration <= (int) c.get("closes"); t += 30)
      if (future(day, t) && available(c.get("id"), staff, day, t, duration)) result.add(t);
    return result;
  }

  @Transactional
  public Map<String, Object> book(String slug, Api.BookRequest r, String uid) {
    Map<String, Object> c = company(slug);
    Object cid = c.get("id");
    // Every scheduling mutation takes this tenant lock, including hours/staff changes.
    db.queryForObject("select id from companies where id=? for update", String.class, cid);
    c = company(slug);
    checkDate(r.date());
    Map<String, Object> s = service(cid, r.service());
    checkStaff(cid, r.staff());
    int duration = (int) s.get("duration"), t = r.time();
    if (!working(c, r.date())
        || t < (int) c.get("opens")
        || t + duration > (int) c.get("closes")
        || t % 30 != 0
        || t < 0
        || t >= 1440
        || !future(r.date(), t)) throw bad("Это время недоступно");
    if (!available(cid, r.staff(), r.date(), t, duration))
      throw new ResponseStatusException(
          HttpStatus.CONFLICT, "Это время уже занято. Выберите другое.");
    String id = UUID.randomUUID().toString();
    db.update(
        "insert into"
            + " bookings(id,company_id,service_id,staff_id,booking_date,start_minute,duration,price,customer_name,phone,user_id)"
            + " values(?,?,?,?,?,?,?,?,?,?,?)",
        id,
        cid,
        r.service(),
        r.staff(),
        r.date(),
        t,
        duration,
        s.get("price"),
        r.name().trim(),
        r.phone().trim(),
        uid);
    return Map.of(
        "id", id, "date", r.date(), "time", t, "duration", duration, "price", s.get("price"));
  }

  public List<Map<String, Object>> appointments(Object cid) {
    return db.queryForList(
        "select"
            + " b.id,b.booking_date,b.start_minute,b.duration,b.price,b.customer_name,b.phone,b.status,s.name"
            + " as service_name,m.name as staff_name from bookings b join services s on"
            + " s.id=b.service_id join staff m on m.id=b.staff_id where b.company_id=? order by"
            + " b.booking_date,b.start_minute",
        cid);
  }

  @Transactional
  public void cancel(String slug, String id, String uid) {
    Map<String, Object> c = owned(slug, uid);
    db.queryForObject("select id from companies where id=? for update", String.class, c.get("id"));
    if (db.update(
            "update bookings set status='cancelled' where id=? and company_id=? and"
                + " status='confirmed'",
            id,
            c.get("id"))
        != 1) throw bad("Запись не найдена или уже отменена");
  }
}
