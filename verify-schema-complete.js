const { PrismaClient } = require('./prisma/src/generated');

const prisma = new PrismaClient();

async function verifyCompleteSchema() {
  console.log('🔍 Verifying complete database schema...\n');

  try {
    // 1. Verify all tables exist
    console.log('1. Verifying tables exist:');
    
    const tables = ['rooms', 'participants', 'messages', 'session_logs'];
    for (const table of tables) {
      try {
        const result = await prisma.$queryRawUnsafe(
          `SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '${table}'`
        );
        const exists = result[0].count > 0;
        console.log(`   ${exists ? '✓' : '✗'} Table "${table}" exists`);
      } catch (error) {
        console.log(`   ✗ Table "${table}" - Error: ${error.message}`);
      }
    }

    // 2. Verify enums exist
    console.log('\n2. Verifying enums exist:');
    const enums = ['ParticipantStatus', 'MessageType'];
    for (const enumName of enums) {
      try {
        const result = await prisma.$queryRawUnsafe(
          `SELECT COUNT(*) FROM pg_type WHERE typname = '${enumName}'`
        );
        const exists = result[0].count > 0;
        console.log(`   ${exists ? '✓' : '✗'} Enum "${enumName}" exists`);
      } catch (error) {
        console.log(`   ✗ Enum "${enumName}" - Error: ${error.message}`);
      }
    }

    // 3. Verify Room table structure
    console.log('\n3. Verifying Room table structure:');
    const roomColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'rooms'
      ORDER BY ordinal_position
    `);
    
    const expectedRoomColumns = ['id', 'name', 'capacity', 'current_occupancy', 'created_at'];
    for (const col of expectedRoomColumns) {
      const found = roomColumns.find(c => c.column_name === col);
      console.log(`   ${found ? '✓' : '✗'} Column "${col}" ${found ? `(${found.data_type})` : 'missing'}`);
    }

    // 4. Verify Participant table structure
    console.log('\n4. Verifying Participant table structure:');
    const participantColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'participants'
      ORDER BY ordinal_position
    `);
    
    const expectedParticipantColumns = ['id', 'user_id', 'room_id', 'joined_at', 'status'];
    for (const col of expectedParticipantColumns) {
      const found = participantColumns.find(c => c.column_name === col);
      console.log(`   ${found ? '✓' : '✗'} Column "${col}" ${found ? `(${found.data_type})` : 'missing'}`);
    }

    // 5. Verify Message table structure
    console.log('\n5. Verifying Message table structure:');
    const messageColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'messages'
      ORDER BY ordinal_position
    `);
    
    const expectedMessageColumns = ['id', 'room_id', 'user_id', 'content', 'type', 'timestamp'];
    for (const col of expectedMessageColumns) {
      const found = messageColumns.find(c => c.column_name === col);
      console.log(`   ${found ? '✓' : '✗'} Column "${col}" ${found ? `(${found.data_type})` : 'missing'}`);
    }

    // 6. Verify SessionLog table structure
    console.log('\n6. Verifying SessionLog table structure:');
    const sessionLogColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'session_logs'
      ORDER BY ordinal_position
    `);
    
    const expectedSessionLogColumns = ['id', 'room_id', 'user_id', 'duration', 'created_at'];
    for (const col of expectedSessionLogColumns) {
      const found = sessionLogColumns.find(c => c.column_name === col);
      console.log(`   ${found ? '✓' : '✗'} Column "${col}" ${found ? `(${found.data_type})` : 'missing'}`);
    }

    // 7. Verify indexes
    console.log('\n7. Verifying indexes:');
    const indexes = await prisma.$queryRawUnsafe(`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('rooms', 'participants', 'messages', 'session_logs')
      ORDER BY tablename, indexname
    `);
    
    console.log(`   Found ${indexes.length} indexes:`);
    indexes.forEach(idx => {
      console.log(`   - ${idx.tablename}.${idx.indexname}`);
    });

    // 8. Verify foreign key constraints
    console.log('\n8. Verifying foreign key constraints:');
    const foreignKeys = await prisma.$queryRawUnsafe(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('participants', 'messages', 'session_logs')
      ORDER BY tc.table_name
    `);
    
    console.log(`   Found ${foreignKeys.length} foreign key constraints:`);
    foreignKeys.forEach(fk => {
      console.log(`   - ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });

    // 9. Verify unique constraints
    console.log('\n9. Verifying unique constraints:');
    const uniqueConstraints = await prisma.$queryRawUnsafe(`
      SELECT
        tc.table_name,
        tc.constraint_name,
        kcu.column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'UNIQUE'
      AND tc.table_name IN ('rooms', 'participants')
      ORDER BY tc.table_name
    `);
    
    console.log(`   Found ${uniqueConstraints.length} unique constraints:`);
    uniqueConstraints.forEach(uc => {
      console.log(`   - ${uc.table_name}.${uc.column_name} (${uc.constraint_name})`);
    });

    // 10. Verify 10 rooms are seeded
    console.log('\n10. Verifying seeded data:');
    const roomCount = await prisma.room.count();
    console.log(`   ${roomCount === 10 ? '✓' : '✗'} Found ${roomCount} rooms (expected: 10)`);
    
    if (roomCount === 10) {
      const rooms = await prisma.room.findMany({ orderBy: { name: 'asc' } });
      const allCorrect = rooms.every(r => 
        r.capacity === 50 && 
        r.currentOccupancy === 0 &&
        r.name.startsWith('Study Room ')
      );
      console.log(`   ${allCorrect ? '✓' : '✗'} All rooms have correct default values`);
    }

    console.log('\n✅ Schema verification complete!');
    return true;

  } catch (error) {
    console.error('\n❌ Error during verification:', error.message);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

verifyCompleteSchema()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
