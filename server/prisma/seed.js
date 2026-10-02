require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedDemoUser(database = prisma) {
  await database.transaction.deleteMany({ where: { userId: 'demo-user' } });
  await database.event.deleteMany({ where: { userId: 'demo-user' } });

  const user = await database.user.upsert({
    where: { id: 'demo-user' },
    update: {
      name: 'Sentinel Demo',
      phoneNumber: '+254700000000',
      trustScore: 90,
    },
    create: {
      id: 'demo-user',
      name: 'Sentinel Demo',
      phoneNumber: '+254700000000',
      trustScore: 90,
    },
  });

  await database.device.upsert({
    where: { userId_installationId: { userId: user.id, installationId: 'demo-installation' } },
    update: {
      manufacturer: 'Sentinel',
      model: 'Demo Device',
      os: 'Android',
      osVersion: '14',
      trusted: true,
      trustedLatitude: -1.286389,
      trustedLongitude: 36.817223,
    },
    create: {
      userId: user.id,
      installationId: 'demo-installation',
      manufacturer: 'Sentinel',
      model: 'Demo Device',
      os: 'Android',
      osVersion: '14',
      trusted: true,
      trustedLatitude: -1.286389,
      trustedLongitude: 36.817223,
    },
  });

  return user;
}

if (require.main === module) {
  seedDemoUser()
    .then((user) => console.log(`Seeded ${user.id} with trust ${user.trustScore}`))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { seedDemoUser };
