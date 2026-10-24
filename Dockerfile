FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package
FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S forma && adduser -S forma -G forma
WORKDIR /app
COPY --from=build --chown=forma:forma /app/target/forma-1.0.0.jar app.jar
USER forma
EXPOSE 8080
ENV SPRING_PROFILES_ACTIVE=prod
ENTRYPOINT ["java","-XX:MaxRAMPercentage=70","-jar","app.jar"]
