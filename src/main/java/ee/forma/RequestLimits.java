package ee.forma;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RequestLimits extends OncePerRequestFilter {
  private record Window(long start, int count) {}

  private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

  @Override
  protected void doFilterInternal(
      HttpServletRequest req, HttpServletResponse res, FilterChain chain)
      throws ServletException, IOException {
    if (req.getMethod().equals("POST")
        && req.getRequestURI().matches("/api/companies/[^/]+/bookings")) {
      long now = System.currentTimeMillis();
      if (windows.size() > 10000)
        windows.entrySet().removeIf(e -> now - e.getValue().start() > 600000);
      // Use the socket address, never client-supplied X-Forwarded-For. Behind a proxy this limit is
      // shared.
      if (windows.size() > 10000) {
        reject(res);
        return;
      }
      Window w =
          windows.compute(
              req.getRemoteAddr(),
              (key, old) ->
                  old == null || now - old.start() > 600000
                      ? new Window(now, 1)
                      : new Window(old.start(), old.count() + 1));
      if (w.count() > 30) {
        reject(res);
        return;
      }
    }
    chain.doFilter(req, res);
  }

  void reject(HttpServletResponse res) throws IOException {
    res.setStatus(429);
    res.setHeader("Retry-After", "600");
    res.setContentType("application/json;charset=UTF-8");
    res.getWriter()
        .write("{\"error\":\"Слишком много попыток записи. Попробуйте через 10 минут.\"}");
  }
}
