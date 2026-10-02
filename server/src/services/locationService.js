function toRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function calculateDistanceKm({ fromLatitude, fromLongitude, toLatitude, toLongitude }) {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(toLatitude - fromLatitude);
  const lngDelta = toRadians(toLongitude - fromLongitude);
  const lat1 = toRadians(fromLatitude);
  const lat2 = toRadians(toLatitude);

  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { calculateDistanceKm };
