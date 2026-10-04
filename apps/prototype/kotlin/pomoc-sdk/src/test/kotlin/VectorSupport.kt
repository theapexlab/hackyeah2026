import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

private val specDir = File("../../spec/testvectors")

fun hexToBytes(hex: String): ByteArray = hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

fun loadVector(path: String): JsonObject = Json.parseToJsonElement(File(specDir, path).readText()).jsonObject

fun JsonObject.hex(
    section: String,
    key: String,
): ByteArray =
    hexToBytes(
        getValue(section)
            .jsonObject
            .getValue(key)
            .jsonPrimitive.content,
    )

fun JsonObject.expectsValid(): Boolean = getValue("expect").jsonPrimitive.content == "valid"

// The JDK takes an Ed25519 public key as X.509 SubjectPublicKeyInfo, not as 32 raw bytes.
private val spkiPrefix = hexToBytes("302a300506032b6570032100")

fun verifyEd25519(
    publicKey: ByteArray,
    message: ByteArray,
    signature: ByteArray,
): Boolean {
    val key = KeyFactory.getInstance("Ed25519").generatePublic(X509EncodedKeySpec(spkiPrefix + publicKey))
    return Signature.getInstance("Ed25519").run {
        initVerify(key)
        update(message)
        verify(signature)
    }
}
