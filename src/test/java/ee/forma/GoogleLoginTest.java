package ee.forma;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "spring.datasource.url=jdbc:h2:mem:google-test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
      "forma.google-client-id=test-client.apps.googleusercontent.com",
      "forma.google-client-secret=test-secret",
      "forma.base-url=http://localhost:8080"
    })
@AutoConfigureMockMvc
class GoogleLoginTest {
  @Autowired MockMvc mvc;

  @Test
  void authorizationUsesGoogleStateNonceAndFixedCallback() throws Exception {
    String location =
        mvc.perform(get("/oauth2/authorization/google"))
            .andExpect(status().is3xxRedirection())
            .andReturn()
            .getResponse()
            .getHeader("Location");
    assertNotNull(location);
    assertTrue(location.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"));
    assertTrue(location.contains("state="));
    assertTrue(location.contains("nonce="));
    assertTrue(location.contains("scope=openid%20profile%20email"));
    assertTrue(location.contains("redirect_uri=http://localhost:8080/login/oauth2/code/google"));
    assertFalse(location.contains("test-secret"));
  }

  @Test
  void forgedCallbackCannotLogIn() throws Exception {
    mvc.perform(get("/login/oauth2/code/google").param("code", "forged").param("state", "forged"))
        .andExpect(status().is3xxRedirection())
        .andExpect(redirectedUrl("/login?error=google"));
    mvc.perform(get("/api/manage/companies")).andExpect(status().isUnauthorized());
  }
}
