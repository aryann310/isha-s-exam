const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const papers = await prisma.paper.findMany({ include: { questions: true } });
  console.log(papers.map(p => ({ id: p.id, title: p.title, questionsCount: p.questions.length })));
}
main().finally(() => prisma.$disconnect());
