import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.cbor.ByteString
import kotlinx.serialization.cbor.Cbor
import kotlinx.serialization.cbor.CborLabel
import kotlinx.serialization.decodeFromByteArray
import kotlinx.serialization.encodeToByteArray
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class SkeletonMessage(
    @CborLabel(1) val version: Int,
    @CborLabel(2) val clazz: Int,
    @CborLabel(3) @ByteString val signer: ByteArray,
    @CborLabel(4) val seq: Long,
    @CborLabel(5) val timestamp: Long,
    @CborLabel(6) val ttl: Int,
    @CborLabel(7) val hopLimit: Int,
    @CborLabel(8) val geohash: String? = null,
    @CborLabel(9) val radius: Int? = null,
    @CborLabel(10) @ByteString val payload: ByteArray,
    @CborLabel(11) @ByteString val signature: ByteArray? = null,
)

@OptIn(ExperimentalSerializationApi::class)
private val cbor =
    Cbor {
        useDefiniteLengthEncoding = true
        preferCborLabelsOverNames = true
        alwaysUseByteString = true
    }

class SkeletonVectorTest {
    private val vector = loadVector("skeleton/request-1.json")
    private val request = vector.hex("output", "request_hex")

    // Checked on kotlinx-serialization-cbor 1.11.0: with `@CborLabel` and definite lengths the library
    // writes entries in label order and in the shortest integer form, so the encoder matches Go and no
    // hand-written writer is needed.
    @OptIn(ExperimentalSerializationApi::class)
    @Test
    fun `decoding the Go request and re-encoding it without the signature gives the Go signed bytes`() {
        val message = cbor.decodeFromByteArray<SkeletonMessage>(request)

        assertEquals(1, message.version)
        assertEquals("AED needed now", message.payload.decodeToString())
        assertArrayEquals(
            vector.hex("intermediates", "signed_bytes_hex"),
            cbor.encodeToByteArray(message.copy(signature = null)),
        )
    }

    @OptIn(ExperimentalSerializationApi::class)
    @Test
    fun `the Go signature verifies in Kotlin over the signed bytes`() {
        val message = cbor.decodeFromByteArray<SkeletonMessage>(request)
        val signedBytes = cbor.encodeToByteArray(message.copy(signature = null))

        assertTrue(verifyEd25519(vector.hex("input", "public_key_hex"), signedBytes, requireNotNull(message.signature)))
    }
}
