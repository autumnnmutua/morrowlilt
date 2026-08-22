function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error('USER_SECRET_ENCRYPTION_KEY_INVALID')
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret),
  )
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptSecret(input: {
  encryptionSecret: string
  plaintext: string
  context: string
}): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(input.context),
    },
    await deriveKey(input.encryptionSecret),
    new TextEncoder().encode(input.plaintext),
  )
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  }
}

export async function decryptSecret(input: {
  encryptionSecret: string
  ciphertext: string
  iv: string
  context: string
}): Promise<string> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(input.iv),
        additionalData: new TextEncoder().encode(input.context),
      },
      await deriveKey(input.encryptionSecret),
      base64ToBytes(input.ciphertext),
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    throw new Error('USER_EMAIL_PROVIDER_DECRYPT_FAILED')
  }
}
