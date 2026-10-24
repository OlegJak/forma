package ee.forma;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class Pages {
  @GetMapping({"/", "/studio/{slug}", "/dashboard", "/demo", "/login", "/my-bookings", "/privacy"})
  String app() {
    return "forward:/index.html";
  }
}
