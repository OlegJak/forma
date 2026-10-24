package ee.forma;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@SpringBootTest(
    properties = {
      "spring.datasource.url=jdbc:h2:mem:forma-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
      "forma.google-client-id=",
      "forma.google-client-secret="
    })
@AutoConfigureMockMvc
class PlatformTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired BookingService service;

  RequestPostProcessor user(String sub) {
    return oidcLogin().idToken(t -> t.subject(sub).claim("name", "Test Owner"));
  }

  String date() {
    return LocalDate.now(BookingService.ZONE).plusDays(30).toString();
  }

  Map<String, Object> booking(String sid, String staff, int time) {
    return Map.of(
        "service",
        sid,
        "staff",
        staff,
        "date",
        date(),
        "time",
        time,
        "name",
        "Test Client",
        "phone",
        "+372 0000 0000");
  }

  String createCompany(String sub) throws Exception {
    String slug = "test-" + UUID.randomUUID().toString().substring(0, 8);
    Map<String, Object> body =
        Map.of(
            "name",
            "Test company",
            "slug",
            slug,
            "category",
            "Красота",
            "city",
            "Нарва",
            "description",
            "Test description",
            "address",
            "Test address",
            "opens",
            600,
            "closes",
            1080,
            "weekdays",
            "1,2,3,4,5,6,7");
    mvc.perform(
            post("/api/manage/companies")
                .with(user(sub))
                .with(csrf())
                .contentType("application/json")
                .content(json.writeValueAsString(body)))
        .andExpect(status().isOk());
    return slug;
  }

  String add(String slug, String kind, Object body, String sub) throws Exception {
    return json.readTree(
            mvc.perform(
                    post("/api/manage/" + slug + "/" + kind)
                        .with(user(sub))
                        .with(csrf())
                        .contentType("application/json")
                        .content(json.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString())
        .get("id")
        .asText();
  }

  @Test
  void publicCatalogAndDemoNeverExposeContacts() throws Exception {
    mvc.perform(get("/api/companies"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].owner_id").doesNotExist())
        .andExpect(jsonPath("$[0].phone").doesNotExist());
    mvc.perform(get("/api/demo-dashboard"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.bookings[0].phone").value("Скрыт в деморежиме"));
  }

  @Test
  void loginAndCsrfAreRequired() throws Exception {
    mvc.perform(get("/api/manage/forma")).andExpect(status().isUnauthorized());
    mvc.perform(
            post("/api/companies/forma/bookings")
                .contentType("application/json")
                .content(json.writeValueAsString(booking("hair", "anna", 600))))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/session"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.loggedIn").value(false))
        .andExpect(jsonPath("$.googleEnabled").value(false))
        .andExpect(jsonPath("$.csrf").isString());
  }

  @Test
  void ownerCannotReadOrChangeAnotherCompany() throws Exception {
    String slug = createCompany("owner-a");
    mvc.perform(get("/api/manage/" + slug).with(user("owner-b"))).andExpect(status().isForbidden());
    mvc.perform(
            post("/api/manage/" + slug + "/staff")
                .with(user("owner-b"))
                .with(csrf())
                .contentType("application/json")
                .content("{\"name\":\"Test\",\"role\":\"Test\"}"))
        .andExpect(status().isForbidden());
  }

  @Test
  void tenantValidationOverlapAndCancellation() throws Exception {
    String slug = createCompany("booking-owner");
    String
        sid =
            add(
                slug,
                "services",
                Map.of("name", "Service", "description", "Test", "duration", 60, "price", 4500),
                "booking-owner"),
        staff = add(slug, "staff", Map.of("name", "Master", "role", "Test"), "booking-owner");
    mvc.perform(
            post("/api/companies/" + slug + "/bookings")
                .with(csrf())
                .contentType("application/json")
                .content(json.writeValueAsString(booking("hair", staff, 600))))
        .andExpect(status().isBadRequest());
    String body =
        mvc.perform(
                post("/api/companies/" + slug + "/bookings")
                    .with(csrf())
                    .contentType("application/json")
                    .content(json.writeValueAsString(booking(sid, staff, 600))))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    String id = json.readTree(body).get("id").asText();
    mvc.perform(
            post("/api/companies/" + slug + "/bookings")
                .with(csrf())
                .contentType("application/json")
                .content(json.writeValueAsString(booking(sid, staff, 630))))
        .andExpect(status().isConflict());
    mvc.perform(
            post("/api/manage/" + slug + "/bookings/" + id + "/cancel")
                .with(user("booking-owner"))
                .with(csrf())
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isOk());
    mvc.perform(
            post("/api/companies/" + slug + "/bookings")
                .with(csrf())
                .contentType("application/json")
                .content(json.writeValueAsString(booking(sid, staff, 630))))
        .andExpect(status().isOk());
  }

  @Test
  void serviceAndStaffManagementAndHoursWork() throws Exception {
    String slug = createCompany("manager");
    String sid =
        add(
            slug,
            "services",
            Map.of("name", "Cut", "description", "", "duration", 30, "price", 2000),
            "manager");
    String staff = add(slug, "staff", Map.of("name", "Ann", "role", "Stylist"), "manager");
    mvc.perform(
            get("/api/companies/" + slug + "/slots")
                .param("service", sid)
                .param("staff", staff)
                .param("date", date()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0]").value(600));
    mvc.perform(
            delete("/api/manage/" + slug + "/staff/" + staff).with(user("manager")).with(csrf()))
        .andExpect(status().isOk());
    mvc.perform(
            get("/api/companies/" + slug + "/slots")
                .param("service", sid)
                .param("staff", staff)
                .param("date", date()))
        .andExpect(status().isBadRequest());
  }

  @Test
  void onlyOwnBookingsAppearInAccount() throws Exception {
    mvc.perform(get("/api/my-bookings").with(user("unrelated-user")))
        .andExpect(status().isOk())
        .andExpect(content().json("[]"));
  }

  @Test
  void invalidBookingIsRejected() throws Exception {
    mvc.perform(
            post("/api/companies/forma/bookings")
                .with(csrf())
                .contentType("application/json")
                .content(json.writeValueAsString(booking("hair", "anna", 601))))
        .andExpect(status().isBadRequest());
    Map<String, Object> bad = new HashMap<>(booking("hair", "anna", 600));
    bad.put("name", "x\nname");
    mvc.perform(
            post("/api/companies/forma/bookings")
                .with(csrf())
                .contentType("application/json")
                .content(json.writeValueAsString(bad)))
        .andExpect(status().isBadRequest());
  }

  @Test
  void concurrentBookingCannotDoubleBook() throws Exception {
    String slug = createCompany("concurrent-owner");
    String
        sid =
            add(
                slug,
                "services",
                Map.of("name", "Test", "description", "", "duration", 60, "price", 1000),
                "concurrent-owner"),
        staff = add(slug, "staff", Map.of("name", "Master", "role", "Test"), "concurrent-owner");
    ExecutorService pool = Executors.newFixedThreadPool(2);
    CountDownLatch latch = new CountDownLatch(1);
    Callable<Boolean> task =
        () -> {
          latch.await();
          try {
            service.book(
                slug,
                new Api.BookRequest(
                    sid, staff, LocalDate.parse(date()), 600, "Concurrent", "+3720000000"),
                null);
            return true;
          } catch (org.springframework.web.server.ResponseStatusException e) {
            assertEquals(409, e.getStatusCode().value());
            return false;
          }
        };
    try {
      Future<Boolean> a = pool.submit(task), b = pool.submit(task);
      latch.countDown();
      assertNotEquals(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));
    } finally {
      pool.shutdownNow();
    }
  }
}
