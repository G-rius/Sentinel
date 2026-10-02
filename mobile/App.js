import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const apiUsername = process.env.EXPO_PUBLIC_API_USERNAME || 'sentinel';
const apiPassword = process.env.EXPO_PUBLIC_API_PASSWORD || 'sentinel-dev';
const apiAuth = `Basic ${btoa(`${apiUsername}:${apiPassword}`)}`;
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
  const [trustScore, setTrustScore] = useState(null);
  const [decision, setDecision] = useState('—');
  const [historyEvent, setHistoryEvent] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    getInstallationId().then(setInstallationId).catch(() => setConnection('Unable to create installation ID'));
    refreshTrust();
  }, []);

  async function refreshTrust() {
    if (!apiUrl) {
      setConnection('API URL missing');
      return;
    }
    setIsRefreshing(true);
    try {
      const [trustResponse, eventsResponse] = await Promise.all([
        fetch(`${apiUrl.replace(/\/$/, '')}/users/demo-user/trust`, { headers: { Authorization: apiAuth } }),
        fetch(`${apiUrl.replace(/\/$/, '')}/users/demo-user/events?limit=1`, { headers: { Authorization: apiAuth } }),
      ]);
      const trustPayload = await trustResponse.json();
      const eventsPayload = await eventsResponse.json();
      if (!trustResponse.ok) throw new Error(trustPayload.error || 'Could not refresh trust');
      if (!eventsResponse.ok) throw new Error(eventsPayload.error || 'Could not refresh recent events');
      setTrustScore(trustPayload.trustScore);
      setDecision(trustPayload.action);
      setHistoryEvent(eventsPayload[0] || null);
      setConnection('Connected');
    } catch (error) {
      setConnection('Offline');
      setLastEvent({ error: `${error.message}. Check the backend URL and network.` });
    } finally {
      setIsRefreshing(false);
    }
  }

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
        headers: { 'Content-Type': 'application/json', Authorization: apiAuth },
        body: JSON.stringify(event),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);

      setConnection('Connected');
      setTrustScore(payload.trustScore);
      setDecision(payload.action);
      setHistoryEvent(payload.latestEvent);
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
        <Text style={styles.kicker}>STAGE 2 / TRUST</Text>
        <Text style={styles.title}>Sentinel</Text>
        <View style={styles.rule} />
        <Text style={styles.label}>BACKEND</Text>
        <Text style={[styles.connection, connection === 'Connected' && styles.connected]}>{connection}</Text>
        <View style={styles.trustRow}>
          <View><Text style={styles.label}>CURRENT TRUST</Text><Text style={styles.trustValue}>{trustScore === null ? '—' : trustScore}<Text style={styles.trustOutOf}> / 100</Text></Text></View>
          <View><Text style={styles.label}>LAST DECISION</Text><Text style={[styles.decisionValue, decision === 'BLOCK' && styles.error, decision === 'STEP_UP' && styles.warning]}>{decision}</Text></View>
          <Pressable style={({ pressed }) => [styles.refreshButton, pressed && styles.buttonPressed, isRefreshing && styles.buttonDisabled]} onPress={refreshTrust} disabled={isRefreshing} accessibilityLabel="Refresh trust score">
            {isRefreshing ? <ActivityIndicator color="#f7f5ed" /> : <Text style={styles.refreshText}>Refresh Trust</Text>}
          </Pressable>
        </View>
        <View style={styles.deviceCard}>
          <Text style={styles.label}>DEVICE</Text>
          <Text style={styles.deviceName}>{device.model}</Text>
          <Text style={styles.detail}>{device.manufacturer}</Text>
          <Text style={styles.detail}>{device.os} {device.osVersion}</Text>
        </View>
        <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, isSending && styles.buttonDisabled]} onPress={sendTestEvent} disabled={isSending}>
          {isSending ? <ActivityIndicator color="#f7f5ed" /> : <Text style={styles.buttonText}>Send Test Event</Text>}
        </Pressable>
        {(lastEvent || historyEvent) && <View style={styles.result}><Text style={styles.label}>LAST EVENT</Text>{lastEvent?.error ? <Text style={styles.error}>{lastEvent.error}</Text> : lastEvent?.success ? <><Text style={styles.eventType}>TEST_EVENT</Text><Text style={styles.success}>Received successfully</Text><Text style={styles.detail}>Decision: {lastEvent.action} · Trust: {lastEvent.trustScore}</Text><Text style={styles.detail}>Event ID: {lastEvent.eventId}</Text><Text style={styles.detail}>Received: {lastEvent.receivedAt}</Text></> : <><Text style={styles.eventType}>{historyEvent.type}</Text><Text style={styles.detail}>Decision: {historyEvent.action} · Trust: {historyEvent.resultingTrust}</Text><Text style={styles.detail}>Recorded: {historyEvent.timestamp}</Text></>}</View>}
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
  trustRow: { alignItems: 'center', backgroundColor: '#f7f5ed', flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 24, padding: 16 },
  trustValue: { color: '#17211f', fontSize: 28, fontWeight: '800', marginTop: 7 },
  trustOutOf: { color: '#82968d', fontSize: 12, fontWeight: '500' },
  decisionValue: { color: '#25845b', fontSize: 15, fontWeight: '800', marginTop: 12 },
  warning: { color: '#b1741e' },
  refreshButton: { alignItems: 'center', backgroundColor: '#355149', justifyContent: 'center', minHeight: 42, paddingHorizontal: 12 },
  refreshText: { color: '#f7f5ed', fontSize: 12, fontWeight: '700' },
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
