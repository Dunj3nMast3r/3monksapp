FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

# Import Zscaler root CA (needed if building behind corporate proxy)
# On Lightsail this is harmless — cert is only used during build
COPY zscaler_root.pem /tmp/zscaler_root.pem
RUN keytool -importcert -file /tmp/zscaler_root.pem -alias zscaler_root \
    -cacerts -storepass changeit -noprompt

# Bounded Maven memory so the build fits on a small server
ENV MAVEN_OPTS="-Xmx512m"

# Dependencies in their own layer: they are only downloaded again when pom.xml changes
COPY pom.xml .
RUN mvn -B dependency:go-offline

COPY src ./src
RUN mvn -B clean package -DskipTests

FROM eclipse-temurin:17-jre-jammy
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar

# Security: run as non-root
RUN groupadd -r appuser && useradd -r -g appuser appuser
USER appuser

EXPOSE 8080
# Through a shell so JAVA_OPTS from docker-compose (heap limits) is applied
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
