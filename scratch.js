const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const templates = await prisma.noteTemplate.findMany();
  console.log("Total templates:", templates.length);
  templates.forEach(t => console.log(t.id, t.name, t.source, t.isActive));
}
main().catch(console.error).finally(() => prisma.$disconnect());
