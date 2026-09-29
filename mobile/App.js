import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const installationKey = '@sentinel/installation-id';

function readDevice() {
  return {
    manufacturer: Device.manufacturer || 'Unknown',
    model: Device.modelName || 'Unknown',
    os: Device.osName || 'Unknown',
    osVersion: Device.osVersion || 'Unknown',
  };
}

async function getInstallationId() {
  const existingId = await AsyncStorage.getItem(installationKey);
  if (existingId) return existingId;

  const newId = Crypto.randomUUID();
  await AsyncStorage.setItem(installationKey, newId);
  return newId;
}

export default function App() {
  const [device, setDevice] = useState(readDevice());
  const [installationId, setInstallationId] = useState(null);
  const [connection, setConnection] = useState(apiUrl ? 'Not tested' : 'API URL missing');
  const [lastEvent, setLastEvent] = useState(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    getInstallationId().then(setInstallationId).catch(() => setConnection('Unable to create installation ID'));
  }, []);

  async function sendTestEvent() {
    setIsSending(true);
    setLastEvent(null);
    setDevice(readDevice());

    if (!apiUrl) {
      setConnection('API URL missing');
      setLastEvent({ error: 'Set EXPO_PUBLIC_API_URL in mobile/.env and restart Expo.' });
      setIsSending(false);
      return;
    }

    try {
      const eventInstallationId = installationId || await getInstallationId();
      setInstallationId(eventInstallationId);
      const event = {
        type: 'TEST_EVENT',
        userId: 'demo-user',
        installationId: eventInstallationId,
        device: readDevice(),
        timestamp: new Date().toISOString(),
        metadata: {},
      };
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);

      setConnection('Connected');
      setLastEvent({ success: true, ...payload });
    } catch (error) {
      setConnection('Offline');
      setLastEvent({ error: `${error.message}. Check the phone and computer are on the same network.` });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>STAGE 1 / FOUNDATION</Text>
        <Text style={styles.title}>Sentinel</Text>
        <View style={styles.rule} />
        <Text style={styles.label}>BACKEND</Text>
        <Text style={[styles.connection, connection === 'Connected' && styles.connected]}>{connection}</Text>
        <View style={styles.deviceCard}>
          <Text style={styles.label}>DEVICE</Text>
          <Text style={styles.deviceName}>{device.model}</Text>
          <Text style={styles.detail}>{device.manufacturer}</Text>
          <Text style={styles.detail}>{device.os} {device.osVersion}</Text>
        </View>
        <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, isSending && styles.buttonDisabled]} onPress={sendTestEvent} disabled={isSending}>
          {isSending ? <ActivityIndicator color="#f7f5ed" /> : <Text style={styles.buttonText}>Send Test Event</Text>}
        </Pressable>
        {lastEvent && <View style={styles.result}><Text style={styles.label}>LAST EVENT</Text>{lastEvent.error ? <Text style={styles.error}>{lastEvent.error}</Text> : <><Text style={styles.eventType}>TEST_EVENT</Text><Text style={styles.success}>Received successfully</Text><Text style={styles.detail}>Event ID: {lastEvent.eventId}</Text><Text style={styles.detail}>Received: {lastEvent.receivedAt}</Text></>}</View>}
        <Text style={styles.installation}>Installation: {installationId || 'Creating...'}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#e6eee9' },
  container: { flexGrow: 1, padding: 28, paddingTop: 44 },
  kicker: { color: '#567369', fontSize: 12, letterSpacing: 1.5, fontWeight: '700' },
  title: { color: '#17211f', fontSize: 58, fontWeight: '800', letterSpacing: -2, marginTop: 8 },
  rule: { height: 1, backgroundColor: '#b7c8bd', marginVertical: 28 },
  label: { color: '#567369', fontSize: 11, letterSpacing: 1.3, fontWeight: '700' },
  connection: { color: '#b1741e', fontSize: 22, fontWeight: '700', marginTop: 8 },
  connected: { color: '#25845b' },
  deviceCard: { backgroundColor: '#f7f5ed', borderTopWidth: 3, borderTopColor: '#17211f', marginTop: 34, padding: 22 },
  deviceName: { color: '#17211f', fontSize: 26, fontWeight: '800', marginTop: 16 },
  detail: { color: '#567369', fontSize: 13, marginTop: 7 },
  button: { alignItems: 'center', backgroundColor: '#17211f', justifyContent: 'center', minHeight: 54, marginTop: 22, paddingHorizontal: 20 },
  buttonPressed: { backgroundColor: '#355149' },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#f7f5ed', fontSize: 15, fontWeight: '700' },
  result: { backgroundColor: '#f7f5ed', marginTop: 22, padding: 22 },
  eventType: { color: '#17211f', fontSize: 20, fontWeight: '800', marginTop: 14 },
  success: { color: '#25845b', fontSize: 15, fontWeight: '700', marginTop: 6 },
  error: { color: '#b13f34', fontSize: 14, lineHeight: 21, marginTop: 12 },
  installation: { color: '#82968d', fontSize: 10, marginTop: 28 },
});
