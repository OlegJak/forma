package ee.forma;

import java.nio.file.*;
import java.time.LocalDate;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class Seed implements CommandLineRunner {
  final BookingService b;

  public Seed(BookingService b) {
    this.b = b;
  }

  @Override
  @Transactional
  public void run(String... args) throws Exception {
    if (b.jdbc().queryForObject("select count(*) from migrations where id='seed-v1'", Integer.class)
        == 0) {
      company(
          "forma",
          "FORMA Studio",
          "Красота",
          "Нарва",
          "Стрижки, укладки и уход. Небольшая пауза в большом дне.",
          "Демонстрационный адрес · Нарва");
      service("hair", "forma", "Стрижка и укладка", "Форма, которая подходит именно вам", 60, 4500);
      service("beard", "forma", "Оформление бороды", "Чёткие линии и внимание к деталям", 30, 2500);
      service(
          "care", "forma", "Уход и восстановление", "Глубокий уход для здоровья волос", 90, 6500);
      staff("anna", "forma", "Анна", "Стилист");
      staff("mark", "forma", "Марк", "Барбер-стилист");
      staff("lisa", "forma", "Елизавета", "Стилист");
      company(
          "balance",
          "Balance Space",
          "Здоровье и отдых",
          "Таллинн",
          "Массаж и восстановление. Пространство, в котором можно выдохнуть.",
          "Демонстрационный адрес · Таллинн");
      service("massage", "balance", "Классический массаж", "Час тишины и восстановления", 60, 5500);
      service("relax", "balance", "Расслабляющий массаж", "Мягкая забота о теле", 90, 7500);
      staff("elena", "balance", "Елена", "Массажист");
      staff("alex", "balance", "Алексей", "Массажист");
      company(
          "detail",
          "Detail Garage",
          "Авто",
          "Нарва",
          "Чистота в каждой детали. Уход за автомобилем по вашему расписанию.",
          "Демонстрационный адрес · Нарва");
      service("wash", "detail", "Комплексная мойка", "Кузов, салон и внимание к мелочам", 60, 3500);
      service("polish", "detail", "Уход за кузовом", "Бережная обработка и защита", 120, 9500);
      staff("ivan", "detail", "Иван", "Детейлер");
      b.jdbc().update("insert into migrations(id) values('seed-v1')");
    }
    if (b.jdbc()
            .queryForObject("select count(*) from migrations where id='legacy-v1'", Integer.class)
        == 0) {
      Path path = Paths.get("data/bookings.tsv");
      if (Files.exists(path))
        for (String line : Files.readAllLines(path)) {
          String[] r = line.split("\t", -1);
          if (r.length != 8) throw new IllegalStateException("Unexpected legacy booking format");
          int price =
              switch (r[7]) {
                case "hair" -> 4500;
                case "beard" -> 2500;
                default -> 6500;
              };
          b.jdbc()
              .update(
                  "insert into"
                      + " bookings(id,company_id,service_id,staff_id,booking_date,start_minute,duration,price,customer_name,phone)"
                      + " values(?,?,?,?,?,?,?,?,?,?)",
                  r[0],
                  "forma",
                  r[7],
                  r[1],
                  LocalDate.parse(r[2]),
                  Integer.parseInt(r[3]),
                  Integer.parseInt(r[4]),
                  price,
                  r[5],
                  r[6]);
        }
      b.jdbc().update("insert into migrations(id) values('legacy-v1')");
    }
  }

  void company(String id, String name, String cat, String city, String desc, String address) {
    b.jdbc()
        .update(
            "insert into"
                + " companies(id,owner_id,slug,name,category,city,description,address,opens,closes,weekdays,demo)"
                + " values(?,?,?,?,?,?,?,?,?,?,?,true)",
            id,
            "demo-owner",
            id,
            name,
            cat,
            city,
            desc,
            address,
            600,
            1080,
            "1,2,3,4,5,6,7");
  }

  void service(String id, String company, String name, String desc, int duration, int price) {
    b.jdbc()
        .update(
            "insert into services(id,company_id,name,description,duration,price)"
                + " values(?,?,?,?,?,?)",
            id,
            company,
            name,
            desc,
            duration,
            price);
  }

  void staff(String id, String company, String name, String role) {
    b.jdbc()
        .update(
            "insert into staff(id,company_id,name,role) values(?,?,?,?)", id, company, name, role);
  }
}
