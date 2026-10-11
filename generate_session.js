const { encrypt } = require('./src/lib/auth/session');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst();
  if (user) {
    const sessionToken = await encrypt({ userId: user.id, role: user.role, username: user.username, name: user.name, expiresAt: new Date(Date.now() + 86400000).toISOString() });
    console.log(sessionToken);
  } else {
    console.log("NO_USER");
  }
}
main();
