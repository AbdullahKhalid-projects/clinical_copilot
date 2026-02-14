
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  // Replace this with the email shown in your screenshot
  const targetEmail = "q.raza.27140@khi.iba.edu.pk" 

  console.log(`Looking for user with email: ${targetEmail}...`)

  const user = await prisma.user.findUnique({
    where: { email: targetEmail }
  })

  if (!user) {
    console.error("User not found! Please check the email address.")
    // Try finding by generic match if specific email fails (fallback for debugging)
    const allUsers = await prisma.user.findMany()
    console.log("Available users:", allUsers.map(u => u.email))
    return
  }

  console.log(`User found: ${user.name} (${user.id})`)
  console.log(`Current Role: ${user.role}`)

  // 1. Ensure Role is DOCTOR
  if (user.role !== 'DOCTOR') {
    console.log("Updating role to DOCTOR...")
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'DOCTOR' }
    })
  } else {
    console.log("Role is already DOCTOR.")
  }

  // 2. Check and Create DoctorProfile
  const existingProfile = await prisma.doctorProfile.findUnique({
    where: { userId: user.id }
  })

  if (existingProfile) {
    console.log("DoctorProfile already exists:", existingProfile.id)
  } else {
    console.log("DoctorProfile missing! Creating one now...")
    const newProfile = await prisma.doctorProfile.create({
      data: {
        userId: user.id,
        specialization: "General Practice" // Default value
      }
    })
    console.log("Success! Created DoctorProfile:", newProfile.id)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
