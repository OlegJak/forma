package ee.forma;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.*;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

@Configuration
public class Security {
  @Bean
  SecurityFilterChain chain(
      HttpSecurity h,
      @Value("${forma.google-client-id}") String id,
      @Value("${forma.google-client-secret}") String secret,
      @Value("${forma.base-url}") String base)
      throws Exception {
    h.authorizeHttpRequests(
        a ->
            a.requestMatchers("/api/manage/**", "/api/my-bookings/**")
                .authenticated()
                .anyRequest()
                .permitAll());
    h.exceptionHandling(
        e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)));
    h.headers(
        x ->
            x.contentSecurityPolicy(
                    c ->
                        c.policyDirectives(
                            "default-src 'self'; script-src 'self'; style-src 'self'; img-src"
                                + " 'self' data:; connect-src 'self'; font-src 'self'; base-uri"
                                + " 'self'; frame-ancestors 'none'; form-action 'self'"
                                + " https://accounts.google.com"))
                .referrerPolicy(
                    r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.SAME_ORIGIN)));
    if (!id.isBlank() && !secret.isBlank()) {
      ClientRegistration google =
          CommonOAuth2Provider.GOOGLE
              .getBuilder("google")
              .clientId(id)
              .clientSecret(secret)
              .scope("openid", "profile", "email")
              .redirectUri(base + "/login/oauth2/code/google")
              .build();
      h.oauth2Login(
          o ->
              o.clientRegistrationRepository(new InMemoryClientRegistrationRepository(google))
                  .defaultSuccessUrl("/dashboard", true)
                  .failureUrl("/login?error=google"));
    }
    h.logout(
        l ->
            l.logoutUrl("/api/logout")
                .logoutSuccessHandler(
                    (req, res, auth) -> {
                      res.setStatus(204);
                    }));
    return h.build();
  }
}
