const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const adminPassword = await bcrypt.hash('aryan@1310', 10)
  const studentPassword = await bcrypt.hash('isha@27', 10)

  // 1. Admin Account
  const admin = await prisma.user.upsert({
    where: { email: 'aryansinh@exam.local' },
    update: {
      username: 'Aryansinh',
      name: 'Aryansinh',
      passwordHash: adminPassword,
      role: 'ADMIN',
      isActive: true,
    },
    create: {
      username: 'Aryansinh',
      email: 'aryansinh@exam.local',
      name: 'Aryansinh',
      passwordHash: adminPassword,
      role: 'ADMIN',
      isActive: true,
    },
  })

  // 2. Student Account
  const student = await prisma.user.upsert({
    where: { email: 'ishubaby@exam.local' },
    update: {
      username: 'ishubaby',
      name: 'Ishu Baby',
      passwordHash: studentPassword,
      role: 'STUDENT',
      isActive: true,
    },
    create: {
      username: 'ishubaby',
      email: 'ishubaby@exam.local',
      name: 'Ishu Baby',
      passwordHash: studentPassword,
      role: 'STUDENT',
      isActive: true,
    },
  })

  // Also migrate any previous attempts from student@example.com to ishubaby
  const oldStudent = await prisma.user.findUnique({
    where: { email: 'student@example.com' },
  })
  if (oldStudent && oldStudent.id !== student.id) {
    await prisma.attempt.updateMany({
      where: { userId: oldStudent.id },
      data: { userId: student.id },
    })
    console.log('Migrated past attempts to student account (ishubaby)')
  }

  console.log('Users seeded successfully:')
  console.log({
    admin: { username: admin.username, role: admin.role },
    student: { username: student.username, role: student.role },
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
