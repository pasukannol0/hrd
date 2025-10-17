const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

async function seed() {
  try {
    await client.connect();
    console.log('Connected to database...');

    console.log('Seeding offices...');
    const officeResult = await client.query(`
      INSERT INTO offices (name, address, city, state, country, postal_code, boundary, timezone)
      VALUES 
        (
          'Headquarters - San Francisco',
          '123 Market Street',
          'San Francisco',
          'CA',
          'USA',
          '94102',
          ST_GeogFromText('POLYGON((-122.4194 37.7749, -122.4184 37.7749, -122.4184 37.7739, -122.4194 37.7739, -122.4194 37.7749))'),
          'America/Los_Angeles'
        ),
        (
          'New York Office',
          '456 Fifth Avenue',
          'New York',
          'NY',
          'USA',
          '10001',
          ST_GeogFromText('POLYGON((-73.9857 40.7489, -73.9847 40.7489, -73.9847 40.7479, -73.9857 40.7479, -73.9857 40.7489))'),
          'America/New_York'
        ),
        (
          'London Office',
          '789 Oxford Street',
          'London',
          'England',
          'UK',
          'W1D 2HG',
          ST_GeogFromText('POLYGON((-0.1428 51.5155, -0.1418 51.5155, -0.1418 51.5145, -0.1428 51.5145, -0.1428 51.5155))'),
          'Europe/London'
        )
      RETURNING id, name;
    `);
    
    const offices = officeResult.rows;
    console.log(`Seeded ${offices.length} offices:`, offices.map(o => o.name).join(', '));

    console.log('Seeding policy sets...');
    await client.query(`
      INSERT INTO policy_sets (name, description, office_id, working_hours_start, working_hours_end, late_threshold_minutes, priority)
      VALUES 
        ('Default Policy', 'Standard 9-5 office policy', NULL, '09:00:00', '17:00:00', 15, 0),
        ('SF Office Policy', 'San Francisco office specific policy', $1, '09:00:00', '17:30:00', 10, 10),
        ('NY Office Policy', 'New York office specific policy', $2, '08:30:00', '17:00:00', 15, 10);
    `, [offices[0].id, offices[1].id]);
    console.log('Seeded policy sets');

    console.log('Seeding office networks...');
    await client.query(`
      INSERT INTO office_networks (office_id, ssid, bssid, network_type)
      VALUES 
        ($1, 'CompanyWiFi-SF', '00:11:22:33:44:55', 'wifi'),
        ($2, 'CompanyWiFi-NY', '00:11:22:33:44:66', 'wifi'),
        ($3, 'CompanyWiFi-LON', '00:11:22:33:44:77', 'wifi');
    `, [offices[0].id, offices[1].id, offices[2].id]);
    console.log('Seeded office networks');

    console.log('Seeding beacons...');
    await client.query(`
      INSERT INTO beacons (office_id, uuid, major, minor, location_description, location_point)
      VALUES 
        ($1, 'f7826da6-4fa2-4e98-8024-bc5b71e0893e', 1, 1, 'SF Office Main Entrance', ST_GeogFromText('POINT(-122.4189 37.7744)')),
        ($1, 'f7826da6-4fa2-4e98-8024-bc5b71e0893e', 1, 2, 'SF Office Second Floor', ST_GeogFromText('POINT(-122.4189 37.7745)')),
        ($2, 'f7826da6-4fa2-4e98-8024-bc5b71e0893e', 2, 1, 'NY Office Main Entrance', ST_GeogFromText('POINT(-73.9852 40.7484)')),
        ($3, 'f7826da6-4fa2-4e98-8024-bc5b71e0893e', 3, 1, 'London Office Reception', ST_GeogFromText('POINT(-0.1423 51.5150)'));
    `, [offices[0].id, offices[1].id, offices[2].id]);
    console.log('Seeded beacons');

    console.log('Seeding NFC tags...');
    await client.query(`
      INSERT INTO nfc_tags (office_id, tag_uid, tag_type, location_description, location_point)
      VALUES 
        ($1, 'E004010123456789', 'NTAG215', 'SF Office Reception Desk', ST_GeogFromText('POINT(-122.4189 37.7744)')),
        ($2, 'E004010123456790', 'NTAG215', 'NY Office Reception Desk', ST_GeogFromText('POINT(-73.9852 40.7484)')),
        ($3, 'E004010123456791', 'NTAG215', 'London Office Reception', ST_GeogFromText('POINT(-0.1423 51.5150)'));
    `, [offices[0].id, offices[1].id, offices[2].id]);
    console.log('Seeded NFC tags');

    console.log('Seeding sample users...');
    const userResult = await client.query(`
      INSERT INTO app_users (email, full_name, phone_number, role, department, employee_id, password_hash)
      VALUES 
        ('admin@company.com', 'Admin User', '+1234567890', 'admin', 'IT', 'EMP001', crypt('password123', gen_salt('bf'))),
        ('john.doe@company.com', 'John Doe', '+1234567891', 'employee', 'Engineering', 'EMP002', crypt('password123', gen_salt('bf'))),
        ('jane.smith@company.com', 'Jane Smith', '+1234567892', 'manager', 'Engineering', 'EMP003', crypt('password123', gen_salt('bf'))),
        ('bob.wilson@company.com', 'Bob Wilson', '+1234567893', 'employee', 'Sales', 'EMP004', crypt('password123', gen_salt('bf'))),
        ('alice.brown@company.com', 'Alice Brown', '+1234567894', 'employee', 'Marketing', 'EMP005', crypt('password123', gen_salt('bf')))
      RETURNING id, email, full_name;
    `);
    
    const users = userResult.rows;
    console.log(`Seeded ${users.length} users:`, users.map(u => u.email).join(', '));

    console.log('Seeding sample devices...');
    await client.query(`
      INSERT INTO devices (user_id, device_identifier, device_name, device_type, os_version, is_trusted)
      VALUES 
        ($1, 'DEVICE-ADMIN-001', 'Admin iPhone', 'ios', '17.0', true),
        ($2, 'DEVICE-JOHN-001', 'John Android', 'android', '14.0', true),
        ($3, 'DEVICE-JANE-001', 'Jane iPhone', 'ios', '17.1', true),
        ($4, 'DEVICE-BOB-001', 'Bob Pixel', 'android', '14.0', true),
        ($5, 'DEVICE-ALICE-001', 'Alice iPhone', 'ios', '16.6', true);
    `, users.map(u => u.id));
    console.log('Seeded sample devices');

    console.log('\n✅ Seed data successfully inserted!');
    console.log('\nSummary:');
    console.log(`- ${offices.length} offices`);
    console.log(`- ${users.length} users`);
    console.log('- 3 policy sets');
    console.log('- 3 office networks');
    console.log('- 4 beacons');
    console.log('- 3 NFC tags');
    console.log('- 5 devices');

  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
