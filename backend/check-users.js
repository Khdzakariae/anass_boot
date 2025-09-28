import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkUsers() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        verified: true
      }
    });
    
    console.log('📊 Users in database:');
    console.table(users);
    
    if (users.length === 0) {
      console.log('❌ No users found in database!');
      console.log('💡 You need to create a user first through the registration endpoint');
    } else {
      console.log(`✅ Found ${users.length} user(s)`);
      console.log('🔑 Valid User IDs for scraping:');
      users.forEach(user => {
        console.log(`   - ${user.id} (${user.email})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();