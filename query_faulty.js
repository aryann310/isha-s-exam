const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const attempts = await prisma.attempt.findMany({
    include: { paper: { include: { exam: true } } }
  });
  const faulty = attempts.filter(a => !a.paper || !a.paper.exam);
  console.log(`Total attempts: ${attempts.length}, Faulty: ${faulty.length}`);
  if (faulty.length > 0) {
    console.log("Faulty attempts:");
    console.dir(faulty, {depth: null});
  }
}
main();
