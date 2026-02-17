FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

# Import Zscaler root CA into JDK truststore (corporate proxy)
COPY zscaler_root.pem /tmp/zscaler_root.pem
RUN keytool -importcert -file /tmp/zscaler_root.pem -alias zscaler_root \
    -cacerts -storepass changeit -noprompt

COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
