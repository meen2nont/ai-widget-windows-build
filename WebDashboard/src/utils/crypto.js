// Helper module for Web Crypto API (AES-GCM) JSON Encryption & Decryption

const STORAGE_KEY = 'ai_widget_encrypted_config';
const DEVICE_SALT_KEY = 'ai_widget_device_salt';

// Get or generate a persistent device salt for key derivation
function getDeviceSalt() {
  let saltHex = localStorage.getItem(DEVICE_SALT_KEY);
  if (!saltHex) {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(DEVICE_SALT_KEY, saltHex);
  }
  return new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

// Derive AES-GCM CryptoKey using device signature and Web Crypto PBKDF2
async function getCryptoKey(passphrase = 'ai-widget-secure-device-key') {
  const enc = new TextEncoder();
  const salt = getDeviceSalt();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt JSON object to Base64 Ciphertext
export async function encryptAndSaveConfig(configObject, passphrase) {
  try {
    const jsonString = JSON.stringify(configObject);
    const enc = new TextEncoder();
    const encodedData = enc.encode(jsonString);

    const key = await getCryptoKey(passphrase);
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12-byte IV for AES-GCM

    const encryptedContent = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encodedData
    );

    // Combine IV + Ciphertext into single array
    const combined = new Uint8Array(iv.length + encryptedContent.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedContent), iv.length);

    // Convert to Base64
    const base64Ciphertext = btoa(String.fromCharCode(...combined));
    localStorage.setItem(STORAGE_KEY, base64Ciphertext);

    // Migration cleanup: Remove legacy unencrypted plaintext keys if present
    localStorage.removeItem('deepseek_key');
    localStorage.removeItem('ollama_key');
    localStorage.removeItem('ollama_pay_key');

    return true;
  } catch (error) {
    console.error('Encryption failed:', error);
    return false;
  }
}

// Decrypt Base64 Ciphertext back to JSON object
export async function loadAndDecryptConfig(passphrase) {
  try {
    const base64Ciphertext = localStorage.getItem(STORAGE_KEY);
    
    // Migration: If no encrypted config, check for legacy unencrypted keys
    if (!base64Ciphertext) {
      const legacyKeys = {
        deepseek: localStorage.getItem('deepseek_key') || '',
        ollama: localStorage.getItem('ollama_key') || '',
        ollamaPay: localStorage.getItem('ollama_pay_key') || ''
      };
      if (legacyKeys.deepseek || legacyKeys.ollama || legacyKeys.ollamaPay) {
        // Automatically migrate legacy keys to encrypted JSON format
        await encryptAndSaveConfig(legacyKeys, passphrase);
        return legacyKeys;
      }
      return { deepseek: '', ollama: '', ollamaPay: '' };
    }

    const combinedString = atob(base64Ciphertext);
    const combined = new Uint8Array(combinedString.length);
    for (let i = 0; i < combinedString.length; i++) {
      combined[i] = combinedString.charCodeAt(i);
    }

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const key = await getCryptoKey(passphrase);
    const decryptedContent = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    const jsonString = dec.decode(decryptedContent);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Decryption failed:', error);
    return { deepseek: '', ollama: '', ollamaPay: '' };
  }
}
