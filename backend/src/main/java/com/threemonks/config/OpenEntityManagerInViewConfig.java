package com.threemonks.config;

import jakarta.persistence.EntityManagerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.orm.jpa.support.OpenEntityManagerInViewInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Open-entity-manager-in-view as Spring Boot sets it up by default (spring.jpa.open-in-view),
 * except for the live order stream: that request stays open for many minutes and would
 * otherwise hold a pooled database connection the whole time, starving the pool.
 */
@Configuration
public class OpenEntityManagerInViewConfig implements WebMvcConfigurer {

    private final EntityManagerFactory entityManagerFactory;

    public OpenEntityManagerInViewConfig(EntityManagerFactory entityManagerFactory) {
        this.entityManagerFactory = entityManagerFactory;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        OpenEntityManagerInViewInterceptor interceptor = new OpenEntityManagerInViewInterceptor();
        interceptor.setEntityManagerFactory(entityManagerFactory);
        registry.addWebRequestInterceptor(interceptor).excludePathPatterns("/api/orders/stream");
    }
}
