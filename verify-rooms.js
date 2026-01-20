const { PrismaClient } = require('./prisma/src/generated');

const prisma = new PrismaClient();

async function verifyRooms() {
  console.log('🔍 Verifying rooms in database...\n');

  try {
    // Get all rooms
    const rooms = await prisma.room.findMany({
      orderBy: { name: 'asc' }
    });

    console.log(`Found ${rooms.length} rooms:\n`);

    rooms.forEach((room, index) => {
      console.log(`${index + 1}. ${room.name}`);
      console.log(`   ID: ${room.id}`);
      console.log(`   Capacity: ${room.capacity}`);
      console.log(`   Current Occupancy: ${room.currentOccupancy}`);
      console.log(`   Created At: ${room.createdAt}`);
      console.log('');
    });

    // Verify expectations
    console.log('Verification Results:');
    console.log(`✓ Total rooms: ${rooms.length} (expected: 10)`);
    
    const allHaveCapacity50 = rooms.every(r => r.capacity === 50);
    console.log(`${allHaveCapacity50 ? '✓' : '✗'} All rooms have capacity 50`);
    
    const allHaveOccupancy0 = rooms.every(r => r.currentOccupancy === 0);
    console.log(`${allHaveOccupancy0 ? '✓' : '✗'} All rooms have current_occupancy 0`);
    
    const allHaveUniqueNames = new Set(rooms.map(r => r.name)).size === rooms.length;
    console.log(`${allHaveUniqueNames ? '✓' : '✗'} All rooms have unique names`);
    
    const allHaveValidIds = rooms.every(r => r.id && r.id.length > 0);
    console.log(`${allHaveValidIds ? '✓' : '✗'} All rooms have valid UUIDs`);

    if (rooms.length === 10 && allHaveCapacity50 && allHaveOccupancy0 && allHaveUniqueNames && allHaveValidIds) {
      console.log('\n✅ All verifications passed!');
      return true;
    } else {
      console.log('\n❌ Some verifications failed!');
      return false;
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

verifyRooms()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
