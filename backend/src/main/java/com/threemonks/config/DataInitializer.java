package com.threemonks.config;

import com.threemonks.entity.*;
import com.threemonks.enums.ProductCategory;
import com.threemonks.enums.Role;
import com.threemonks.enums.UnitType;
import com.threemonks.repository.*;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

        private static final Logger logger = LoggerFactory.getLogger(DataInitializer.class);

        private final UserRepository userRepository;
        private final ShopRepository shopRepository;
        private final FruitRepository fruitRepository;
        private final ProductRepository productRepository;
        private final RawMaterialRepository rawMaterialRepository;
        private final PasswordEncoder passwordEncoder;
        private final JdbcTemplate jdbcTemplate;

        @Value("${app.default-admin.username}")
        private String adminUsername;

        @Value("${app.default-admin.password}")
        private String adminPassword;

        @Value("${app.default-admin.email}")
        private String adminEmail;

        @Override
        public void run(String... args) {
                // Ensure the `eligible_for_blend` column exists in fruits table with proper
                // NULL handling
                try {
                        jdbcTemplate.execute(
                                        "ALTER TABLE fruits ADD COLUMN IF NOT EXISTS eligible_for_blend BOOLEAN DEFAULT true");
                } catch (Exception e) {
                        // Column may already exist, continue
                }
                jdbcTemplate.execute("UPDATE fruits SET eligible_for_blend = true WHERE eligible_for_blend IS NULL");

                // Ensure the `eligible_for_shot` column exists in fruits table with proper NULL
                // handling
                try {
                        jdbcTemplate.execute(
                                        "ALTER TABLE fruits ADD COLUMN IF NOT EXISTS eligible_for_shot BOOLEAN DEFAULT true");
                } catch (Exception e) {
                        // Column may already exist, continue
                }
                jdbcTemplate.execute("UPDATE fruits SET eligible_for_shot = true WHERE eligible_for_shot IS NULL");

                // Create default shop if none exists
                if (shopRepository.count() == 0) {
                        Shop defaultShop = Shop.builder()
                                        .name("3Monks - Main Branch")
                                        .address("Main Street")
                                        .city("City")
                                        .state("State")
                                        .pincode("000000")
                                        .phone("9999999999")
                                        .email("main@3monks.com")
                                        .active(true)
                                        .build();
                        shopRepository.save(defaultShop);
                        logger.info("Default shop created: {}", defaultShop.getName());
                }

                // Create default admin if none exists
                if (!userRepository.existsByUsername(adminUsername)) {
                        User admin = User.builder()
                                        .username(adminUsername)
                                        .password(passwordEncoder.encode(adminPassword))
                                        .email(adminEmail)
                                        .fullName("Super Admin")
                                        .role(Role.SUPER_ADMIN)
                                        .active(true)
                                        .build();
                        userRepository.save(admin);
                        logger.info("Default admin user created: {}", adminUsername);
                }

                // Seed fruits and products if none exist
                if (fruitRepository.count() == 0) {
                        seedFruitsAndProducts();
                }

                // Assign shortCodes to existing fruits that don't have them
                assignFruitShortCodes();

                // Seed raw materials if none exist
                if (rawMaterialRepository.count() == 0) {
                        seedRawMaterials();
                }
        }

        private void seedFruitsAndProducts() {
                // Seed fruits
                String[] fruitNames = { "Jamun", "Mango", "Kiwi", "Coconut", "Blueberry", "Mulberry", "Strawberry",
                                "Avocado",
                                "Sitaphal" };
                for (int i = 0; i < fruitNames.length; i++) {
                        fruitRepository.save(Fruit.builder()
                                        .name(fruitNames[i])
                                        .shortCode(i + 1)
                                        .active(true)
                                        .eligibleForShot(true)
                                        .eligibleForBlend(true)
                                        .build());
                }
                logger.info("Seeded {} fruits with shortCodes 1-{}", fruitNames.length, fruitNames.length);

                // Build a map for easy lookup
                Map<String, Fruit> fruitMap = fruitRepository.findAll().stream()
                                .collect(Collectors.toMap(Fruit::getName, f -> f));

                // --- Creamy Blends (₹90) - single fruit each ---
                createProduct("Coconut Charm", "Creamy coconut smoothie", ProductCategory.CREAMY_BLEND, 90, fruitMap,
                                "Coconut");
                createProduct("Mango Melt", "Rich mango smoothie", ProductCategory.CREAMY_BLEND, 90, fruitMap, "Mango");
                createProduct("Blueberry Bliss", "Refreshing blueberry smoothie", ProductCategory.CREAMY_BLEND, 90,
                                fruitMap,
                                "Blueberry");
                createProduct("Mulberry Magic", "Delicious mulberry smoothie", ProductCategory.CREAMY_BLEND, 90,
                                fruitMap,
                                "Mulberry");
                createProduct("Strawberry Spark", "Vibrant strawberry smoothie", ProductCategory.CREAMY_BLEND, 90,
                                fruitMap,
                                "Strawberry");
                createProduct("Avocado Affair", "Creamy avocado smoothie", ProductCategory.CREAMY_BLEND, 90, fruitMap,
                                "Avocado");
                createProduct("Sitaphal Soul", "Custard apple smoothie", ProductCategory.CREAMY_BLEND, 90, fruitMap,
                                "Sitaphal");
                createProduct("Jamun Joy", "Tangy jamun smoothie", ProductCategory.CREAMY_BLEND, 90, fruitMap, "Jamun");
                logger.info("Seeded 8 Creamy Blends");

                // --- Curated Blends (₹90) - two fruits each ---
                createProduct("Mango + Strawberry", "Mango strawberry fusion", ProductCategory.CURATED_BLEND, 90,
                                fruitMap,
                                "Mango", "Strawberry");
                createProduct("Blueberry + Jamun", "Blueberry jamun fusion", ProductCategory.CURATED_BLEND, 90,
                                fruitMap,
                                "Blueberry", "Jamun");
                createProduct("Sitaphal + Mango", "Sitaphal mango fusion", ProductCategory.CURATED_BLEND, 90, fruitMap,
                                "Sitaphal", "Mango");
                createProduct("Coconut + Avocado", "Coconut avocado fusion", ProductCategory.CURATED_BLEND, 90,
                                fruitMap,
                                "Coconut", "Avocado");
                createProduct("Strawberry + Jamun", "Strawberry jamun fusion", ProductCategory.CURATED_BLEND, 90,
                                fruitMap,
                                "Strawberry", "Jamun");
                createProduct("Mango + Coconut", "Mango coconut fusion", ProductCategory.CURATED_BLEND, 90, fruitMap,
                                "Mango",
                                "Coconut");
                logger.info("Seeded 6 Curated Blends");

                // --- Shots (₹40) ---
                createProduct("Jamun Detoxer", "Detoxifying jamun shot", ProductCategory.SHOT, 40, fruitMap, "Jamun");
                createProduct("Kiwi Green Gut", "Gut-healthy kiwi shot", ProductCategory.SHOT, 40, fruitMap, "Kiwi");
                createProduct("Mango Delight", "Refreshing mango shot", ProductCategory.SHOT, 40, fruitMap, "Mango");
                logger.info("Seeded 3 Shots");
        }

        private void createProduct(String name, String description, ProductCategory category, double price,
                        Map<String, Fruit> fruitMap, String... fruitNames) {
                List<Fruit> fruits = Arrays.stream(fruitNames)
                                .map(fruitMap::get)
                                .collect(Collectors.toList());

                Product product = Product.builder()
                                .name(name)
                                .description(description)
                                .category(category)
                                .price(BigDecimal.valueOf(price))
                                .active(true)
                                .build();
                product.setFruits(fruits);
                productRepository.save(product);
        }

        private void seedRawMaterials() {
                // Fruit-based raw materials (GRAM)
                String[] fruitMaterials = { "Coconut", "Mango", "Blueberry", "Mulberry", "Strawberry", "Avocado",
                                "Sitaphal",
                                "Jamun", "Kiwi" };
                for (String name : fruitMaterials) {
                        rawMaterialRepository.save(RawMaterial.builder()
                                        .name(name)
                                        .unitType(UnitType.GRAM)
                                        .costPerUnit(BigDecimal.valueOf(0.50))
                                        .vendorName("Fresh Fruits Supplier")
                                        .vendorContact("9876543210")
                                        .reorderLevel(BigDecimal.valueOf(500))
                                        .active(true)
                                        .build());
                }

                // Thick Milk (ML)
                rawMaterialRepository.save(RawMaterial.builder()
                                .name("Thick Milk")
                                .unitType(UnitType.ML)
                                .costPerUnit(BigDecimal.valueOf(0.08))
                                .vendorName("Dairy Fresh")
                                .vendorContact("9876543211")
                                .reorderLevel(BigDecimal.valueOf(5000))
                                .active(true)
                                .build());

                logger.info("Seeded {} raw materials", fruitMaterials.length + 1);
        }

                        private void assignFruitShortCodes() {
                // Predefined order: Jamun=1, Mango=2, Kiwi=3, then rest
                Map<String, Integer> codeMap = Map.of(
                                "Jamun", 1, "Mango", 2, "Kiwi", 3, "Coconut", 4,
                                "Blueberry", 5, "Mulberry", 6, "Strawberry", 7, "Avocado", 8, "Sitaphal", 9);
                List<Fruit> fruits = fruitRepository.findAll();
                int maxCode = fruits.stream()
                                .map(Fruit::getShortCode)
                                .filter(c -> c != null)
                                .max(Integer::compareTo)
                                .orElse(0);

                for (Fruit fruit : fruits) {
                        Integer predefined = codeMap.get(fruit.getName());
                        if (predefined != null && !predefined.equals(fruit.getShortCode())) {
                                fruit.setShortCode(predefined);
                                fruitRepository.save(fruit);
                                logger.info("Reassigned shortCode {} to fruit: {}", fruit.getShortCode(),
                                                fruit.getName());
                        } else if (fruit.getShortCode() == null) {
                                fruit.setShortCode(++maxCode);
                                fruitRepository.save(fruit);
                                logger.info("Assigned shortCode {} to fruit: {}", fruit.getShortCode(),
                                                fruit.getName());
                        }
                }
        }
}
