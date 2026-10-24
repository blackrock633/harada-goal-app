import Storage from 'expo-sqlite/kv-store';

/** Sandbox key-value store for install flags (wiped on uninstall, unlike the keychain). */
export const installFlags = Storage;
