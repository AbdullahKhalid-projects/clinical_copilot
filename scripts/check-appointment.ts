
import { PrismaClient } from '@prisma/client'
import { config } from 'dotenv';
config();

const prisma = new PrismaClient();

async function main() {
  const appointmentId = "a369053b-6766-4b6f-b5fd-2c0cbd9473ff";
  console.log(`Checking appointment: ${appointmentId}`);

  const apt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
        doctor: true,
        patient: true
    }
  });

  if (apt) {
    console.log("Appointment FOUND!");
    console.log(apt);
  } else {
    console.log("Appointment NOT FOUND.");
  }
  
  // Also list all appointments just in case
  const all = await prisma.appointment.findMany({ take: 5 });
  console.log("First 5 appointments in DB:", all.map(a => ({ id: a.id, date: a.date })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
