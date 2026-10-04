import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class VectorTest {
    @Test
    fun `rfc8032 test 1 verifies with the JDK`() {
        val vector = loadVector("ed25519/rfc8032-1.json")

        val verifies =
            verifyEd25519(
                vector.hex("input", "public_key_hex"),
                vector.hex("input", "message_hex"),
                vector.hex("output", "signature_hex"),
            )

        assertEquals(vector.expectsValid(), verifies)
    }
}
