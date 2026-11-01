package com.threemonks.service.push;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;

/**
 * Sends Web Push messages using only the JDK: VAPID authentication (RFC 8292) and
 * aes128gcm payload encryption (RFC 8291 / RFC 8188).
 */
public class WebPushSender {

    private static final Base64.Encoder B64URL = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64URL_DECODE = Base64.getUrlDecoder();
    private static final int RECORD_SIZE = 4096;
    private static final Duration VAPID_LIFETIME = Duration.ofHours(12);

    private final ECPublicKey vapidPublicKey;
    private final ECPrivateKey vapidPrivateKey;
    private final String subject;
    private final HttpClient httpClient;

    public WebPushSender(KeyPair vapidKeys, String subject) {
        this.vapidPublicKey = (ECPublicKey) vapidKeys.getPublic();
        this.vapidPrivateKey = (ECPrivateKey) vapidKeys.getPrivate();
        this.subject = subject;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    public static KeyPair generateKeyPair() throws GeneralSecurityException {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        return generator.generateKeyPair();
    }

    /** Public key in the form browsers expect for applicationServerKey (uncompressed point, base64url). */
    public String publicKeyBase64Url() {
        return B64URL.encodeToString(encodePoint(vapidPublicKey.getW()));
    }

    /**
     * Encrypts and posts a message to a subscription's push service.
     * Returns the HTTP status; 404 and 410 mean the subscription is gone.
     */
    public int send(String endpoint, String p256dh, String auth, String payload, int ttlSeconds)
            throws Exception {
        byte[] body = encrypt(payload.getBytes(StandardCharsets.UTF_8),
                B64URL_DECODE.decode(p256dh), B64URL_DECODE.decode(auth));
        URI uri = URI.create(endpoint);
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(15))
                .header("TTL", String.valueOf(ttlSeconds))
                .header("Urgency", "high")
                .header("Content-Encoding", "aes128gcm")
                .header("Content-Type", "application/octet-stream")
                .header("Authorization", "vapid t=" + vapidJwt(uri) + ", k=" + publicKeyBase64Url())
                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    // RFC 8291: one aes128gcm record keyed from ECDH with the subscription's key and its auth secret
    byte[] encrypt(byte[] plaintext, byte[] userAgentPublic, byte[] authSecret) throws GeneralSecurityException {
        KeyPair ephemeral = generateKeyPair();
        byte[] serverPublic = encodePoint(((ECPublicKey) ephemeral.getPublic()).getW());

        KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(ephemeral.getPrivate());
        agreement.doPhase(decodePublicKey(userAgentPublic), true);
        byte[] sharedSecret = agreement.generateSecret();

        byte[] keyInfo = concat("WebPush: info\0".getBytes(StandardCharsets.US_ASCII), userAgentPublic, serverPublic);
        byte[] ikm = hkdfExpand(hmac(authSecret, sharedSecret), keyInfo, 32);

        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        byte[] prk = hmac(salt, ikm);
        byte[] contentKey = hkdfExpand(prk, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
        byte[] nonce = hkdfExpand(prk, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(contentKey, "AES"), new GCMParameterSpec(128, nonce));
        // 0x02 marks the last (and only) record
        byte[] ciphertext = cipher.doFinal(concat(plaintext, new byte[]{2}));

        ByteBuffer header = ByteBuffer.allocate(16 + 4 + 1 + serverPublic.length);
        header.put(salt).putInt(RECORD_SIZE).put((byte) serverPublic.length).put(serverPublic);
        return concat(header.array(), ciphertext);
    }

    // RFC 8292: ES256 JWT for the push service's origin
    String vapidJwt(URI endpoint) throws GeneralSecurityException {
        String audience = endpoint.getScheme() + "://" + endpoint.getHost()
                + (endpoint.getPort() == -1 ? "" : ":" + endpoint.getPort());
        long expiry = Instant.now().plus(VAPID_LIFETIME).getEpochSecond();
        String header = B64URL.encodeToString("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
        String claims = B64URL.encodeToString(("{\"aud\":\"" + audience + "\",\"exp\":" + expiry
                + ",\"sub\":\"" + subject + "\"}").getBytes(StandardCharsets.UTF_8));
        String signingInput = header + "." + claims;
        Signature signer = Signature.getInstance("SHA256withECDSA");
        signer.initSign(vapidPrivateKey);
        signer.update(signingInput.getBytes(StandardCharsets.US_ASCII));
        return signingInput + "." + B64URL.encodeToString(derToRaw(signer.sign()));
    }

    private ECPublicKey decodePublicKey(byte[] uncompressed) throws GeneralSecurityException {
        if (uncompressed.length != 65 || uncompressed[0] != 4) {
            throw new InvalidKeyException("Expected an uncompressed P-256 point");
        }
        ECParameterSpec params = vapidPublicKey.getParams();
        ECPoint point = new ECPoint(new BigInteger(1, Arrays.copyOfRange(uncompressed, 1, 33)),
                new BigInteger(1, Arrays.copyOfRange(uncompressed, 33, 65)));
        return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(point, params));
    }

    private static byte[] encodePoint(ECPoint point) {
        return concat(new byte[]{4}, toFixed(point.getAffineX(), 32), toFixed(point.getAffineY(), 32));
    }

    private static byte[] toFixed(BigInteger value, int length) {
        byte[] bytes = value.toByteArray();
        if (bytes.length == length) return bytes;
        byte[] fixed = new byte[length];
        int copy = Math.min(bytes.length, length);
        System.arraycopy(bytes, bytes.length - copy, fixed, length - copy, copy);
        return fixed;
    }

    // JCA returns ECDSA signatures DER-encoded; JWS ES256 needs raw r||s
    private static byte[] derToRaw(byte[] der) {
        int offset = 3; // SEQUENCE tag, length, INTEGER tag
        if (der[1] == (byte) 0x81) offset++;
        int rLength = der[offset];
        BigInteger r = new BigInteger(1, Arrays.copyOfRange(der, offset + 1, offset + 1 + rLength));
        int sOffset = offset + 1 + rLength + 1;
        int sLength = der[sOffset];
        BigInteger s = new BigInteger(1, Arrays.copyOfRange(der, sOffset + 1, sOffset + 1 + sLength));
        return concat(toFixed(r, 32), toFixed(s, 32));
    }

    private static byte[] hmac(byte[] key, byte[] data) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    // Single-block HKDF-Expand (length <= 32)
    private static byte[] hkdfExpand(byte[] prk, byte[] info, int length) throws GeneralSecurityException {
        return Arrays.copyOf(hmac(prk, concat(info, new byte[]{1})), length);
    }

    private static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] part : parts) out.writeBytes(part);
        return out.toByteArray();
    }
}
