exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS postgis;');
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
  pgm.sql('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
};

exports.down = (pgm) => {
  pgm.sql('DROP EXTENSION IF EXISTS pgcrypto;');
  pgm.sql('DROP EXTENSION IF EXISTS "uuid-ossp";');
  pgm.sql('DROP EXTENSION IF EXISTS postgis;');
};
