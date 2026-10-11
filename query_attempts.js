const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const attempts = await prisma.attempt.findMany({ include: { paper: true } });
  console.log(attempts.map(a => ({ id: a.id, paperId: a.paperId, paperTitle: a.paper.title, status: a.status })));
}
main().finally(() => prisma.$disconnect());
