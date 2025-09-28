import { PrismaClient } from "@prisma/client";
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    
    const user = await prisma.user.create({
      data: {
        firstName: 'Test',
        lastName: 'User',
        name: 'Test User',
        email: 'test@example.com',
        password: hashedPassword,
        verified: true
      }
    });
    
    console.log('✅ Test user created successfully:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    
    return user.id;
    
  } catch (error) {
    if (error.code === 'P2002') {
      console.log('ℹ️ Test user already exists, fetching existing user...');
      const existingUser = await prisma.user.findUnique({
        where: { email: 'test@example.com' }
      });
      console.log(`   ID: ${existingUser.id}`);
      return existingUser.id;
    } else {
      console.error('❌ Error creating test user:', error.message);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();