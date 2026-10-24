package ee.forma;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class Api {
  final BookingService b;

  @Value("${forma.google-client-id}")
  String googleId;

  @Value("${forma.google-client-secret}")
  String googleSecret;

  public Api(BookingService b) {
    this.b = b;
  }

  static String uid(Authentication a) {
    return a != null && a.getPrincipal() instanceof OidcUser u ? "google:" + u.getSubject() : null;
  }

  static String requireUid(Authentication a) {
    String id = uid(a);
    if (id == null)
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Войдите через Google");
    return id;
  }

  @GetMapping("/session")
  Map<String, Object> session(Authentication a, HttpServletRequest req) {
    CsrfToken csrf = (CsrfToken) req.getAttribute(CsrfToken.class.getName());
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("csrf", csrf.getToken());
    m.put("googleEnabled", !googleId.isBlank() && !googleSecret.isBlank());
    m.put("loggedIn", uid(a) != null);
    if (uid(a) != null) {
      OidcUser u = (OidcUser) a.getPrincipal();
      m.put("name", Optional.ofNullable(u.getFullName()).orElse("Пользователь"));
    }
    return m;
  }

  @GetMapping("/companies")
  List<Map<String, Object>> companies() {
    return b.jdbc()
        .queryForList(
            "select c.id,c.slug,c.name,c.category,c.city,c.description,c.demo,(select min(s.price)"
                + " from services s where s.company_id=c.id and s.active=true) as min_price from"
                + " companies c order by c.created_at,c.name");
  }

  @GetMapping("/companies/{slug}")
  Map<String, Object> company(@PathVariable String slug) {
    Map<String, Object> c = new LinkedHashMap<>(b.company(slug));
    c.put("services", b.services(c.get("id")));
    c.put("staff", b.staff(c.get("id")));
    return c;
  }

  @GetMapping("/companies/{slug}/slots")
  List<Integer> slots(
      @PathVariable String slug,
      @RequestParam String service,
      @RequestParam String staff,
      @RequestParam LocalDate date) {
    return b.slots(slug, service, staff, date);
  }

  record BookRequest(
      @NotBlank String service,
      @NotBlank String staff,
      @NotNull LocalDate date,
      @Min(0) @Max(1439) int time,
      @NotBlank @Size(min = 2, max = 80) @Pattern(regexp = "[^\\p{Cntrl}]+") String name,
      @NotBlank @Pattern(regexp = "[+0-9 ()-]{7,25}") String phone) {}

  @PostMapping("/companies/{slug}/bookings")
  Map<String, Object> book(
      @PathVariable String slug, @Valid @RequestBody BookRequest r, Authentication a) {
    return b.book(slug, r, uid(a));
  }

  @GetMapping("/manage/companies")
  List<Map<String, Object>> myCompanies(Authentication a) {
    return b.jdbc()
        .queryForList(
            "select slug,name from companies where owner_id=? order by created_at", requireUid(a));
  }

  @GetMapping("/manage/{slug}")
  Map<String, Object> dashboard(@PathVariable String slug, Authentication a) {
    Map<String, Object> c = new LinkedHashMap<>(b.owned(slug, requireUid(a)));
    c.put("services", b.services(c.get("id")));
    c.put("staff", b.staff(c.get("id")));
    c.put("bookings", b.appointments(c.get("id")));
    return c;
  }

  record CompanyRequest(
      @NotBlank @Size(max = 100) String name,
      @NotBlank @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") @Size(min = 3, max = 60) String slug,
      @NotBlank @Size(max = 40) String category,
      @NotBlank @Size(max = 80) String city,
      @NotBlank @Size(max = 1000) String description,
      @NotBlank @Size(max = 200) String address,
      @Min(0) @Max(1410) int opens,
      @Min(30) @Max(1440) int closes,
      @NotBlank @Pattern(regexp = "[1-7](,[1-7])*") String weekdays) {}

  void hours(CompanyRequest r) {
    if (r.opens() % 30 != 0 || r.closes() % 30 != 0 || r.closes() <= r.opens())
      throw BookingService.bad("Проверьте часы работы");
  }

  @PostMapping("/manage/companies")
  @Transactional
  Map<String, String> create(@Valid @RequestBody CompanyRequest r, Authentication a) {
    hours(r);
    String uid = requireUid(a);
    if (b.jdbc()
            .queryForObject("select count(*) from companies where owner_id=?", Integer.class, uid)
        >= 10) throw BookingService.bad("Можно создать до 10 компаний");
    if (b.jdbc()
            .queryForObject("select count(*) from companies where slug=?", Integer.class, r.slug())
        > 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "Этот адрес уже занят");
    String id = UUID.randomUUID().toString();
    b.jdbc()
        .update(
            "insert into"
                + " companies(id,owner_id,slug,name,category,city,description,address,opens,closes,weekdays)"
                + " values(?,?,?,?,?,?,?,?,?,?,?)",
            id,
            uid,
            r.slug(),
            r.name().trim(),
            r.category(),
            r.city().trim(),
            r.description().trim(),
            r.address().trim(),
            r.opens(),
            r.closes(),
            r.weekdays());
    return Map.of("slug", r.slug());
  }

  @PutMapping("/manage/{slug}")
  @Transactional
  Map<String, String> edit(
      @PathVariable String slug, @Valid @RequestBody CompanyRequest r, Authentication a) {
    hours(r);
    Map<String, Object> c = b.owned(slug, requireUid(a));
    b.jdbc()
        .queryForObject(
            "select id from companies where id=? for update", String.class, c.get("id"));
    if (!slug.equals(r.slug())) throw BookingService.bad("Адрес страницы нельзя менять");
    b.jdbc()
        .update(
            "update companies set"
                + " name=?,category=?,city=?,description=?,address=?,opens=?,closes=?,weekdays=?"
                + " where id=?",
            r.name().trim(),
            r.category(),
            r.city().trim(),
            r.description().trim(),
            r.address().trim(),
            r.opens(),
            r.closes(),
            r.weekdays(),
            c.get("id"));
    return Map.of("slug", slug);
  }

  record ServiceRequest(
      @NotBlank @Size(max = 100) String name,
      @Size(max = 300) @NotNull String description,
      @Min(30) @Max(240) int duration,
      @Min(0) @Max(10000000) int price) {}

  @PostMapping("/manage/{slug}/services")
  @Transactional
  Map<String, String> addService(
      @PathVariable String slug, @Valid @RequestBody ServiceRequest r, Authentication a) {
    Map<String, Object> c = b.owned(slug, requireUid(a));
    if (r.duration() % 30 != 0)
      throw BookingService.bad("Длительность должна быть кратна 30 минутам");
    String id = UUID.randomUUID().toString();
    b.jdbc()
        .update(
            "insert into services(id,company_id,name,description,duration,price)"
                + " values(?,?,?,?,?,?)",
            id,
            c.get("id"),
            r.name().trim(),
            r.description(),
            r.duration(),
            r.price());
    return Map.of("id", id);
  }

  record StaffRequest(
      @NotBlank @Size(max = 80) String name, @NotBlank @Size(max = 80) String role) {}

  @PostMapping("/manage/{slug}/staff")
  Map<String, String> addStaff(
      @PathVariable String slug, @Valid @RequestBody StaffRequest r, Authentication a) {
    Map<String, Object> c = b.owned(slug, requireUid(a));
    String id = UUID.randomUUID().toString();
    b.jdbc()
        .update(
            "insert into staff(id,company_id,name,role) values(?,?,?,?)",
            id,
            c.get("id"),
            r.name().trim(),
            r.role().trim());
    return Map.of("id", id);
  }

  @DeleteMapping("/manage/{slug}/{kind}/{id}")
  @Transactional
  Map<String, Boolean> archive(
      @PathVariable String slug,
      @PathVariable String kind,
      @PathVariable String id,
      Authentication a) {
    Map<String, Object> c = b.owned(slug, requireUid(a));
    b.jdbc()
        .queryForObject(
            "select id from companies where id=? for update", String.class, c.get("id"));
    if (!Set.of("staff", "services").contains(kind))
      throw BookingService.bad("Неверный тип записи");
    if (b.jdbc()
            .update(
                "update " + kind + " set active=false where id=? and company_id=?", id, c.get("id"))
        != 1) throw BookingService.bad("Не найдено");
    return Map.of("ok", true);
  }

  @PostMapping("/manage/{slug}/bookings/{id}/cancel")
  Map<String, Boolean> cancel(
      @PathVariable String slug, @PathVariable String id, Authentication a) {
    b.cancel(slug, id, requireUid(a));
    return Map.of("ok", true);
  }

  @GetMapping("/my-bookings")
  List<Map<String, Object>> myBookings(Authentication a) {
    return b.jdbc()
        .queryForList(
            "select b.id,b.booking_date,b.start_minute,b.status,b.price,c.name as"
                + " company_name,c.slug,s.name as service_name,m.name as staff_name from bookings b"
                + " join companies c on c.id=b.company_id join services s on s.id=b.service_id join"
                + " staff m on m.id=b.staff_id where b.user_id=? order by b.booking_date"
                + " desc,b.start_minute",
            requireUid(a));
  }

  @GetMapping("/demo-dashboard")
  Map<String, Object> demo() {
    Map<String, Object> c = new LinkedHashMap<>(b.company("forma"));
    c.put("services", b.services(c.get("id")));
    c.put("staff", b.staff(c.get("id")));
    LocalDate date = LocalDate.now(BookingService.ZONE).plusDays(1);
    c.put(
        "bookings",
        List.of(
            Map.of(
                "id",
                "demo-1",
                "booking_date",
                date,
                "start_minute",
                600,
                "customer_name",
                "Демо-клиент 01",
                "phone",
                "Скрыт в деморежиме",
                "service_name",
                "Стрижка и укладка",
                "staff_name",
                "Анна",
                "price",
                4500,
                "status",
                "confirmed"),
            Map.of(
                "id",
                "demo-2",
                "booking_date",
                date,
                "start_minute",
                720,
                "customer_name",
                "Демо-клиент 02",
                "phone",
                "Скрыт в деморежиме",
                "service_name",
                "Оформление бороды",
                "staff_name",
                "Марк",
                "price",
                2500,
                "status",
                "confirmed")));
    return c;
  }
}
