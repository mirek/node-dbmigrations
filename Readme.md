
## Summary [![Build Status](https://travis-ci.org/mirek/node-dbmigrations.png?branch=master)](https://travis-ci.org/mirek/node-dbmigrations)

Database migrations.

## Usage

Install globally:

    npm install dbmigrations -g

...or in your project (doesn't need to be nodejs):

    npm install dbmigrations --save-dev

Create `./migrations` directory:

    mkdir migrations

Create migration file:

    dbmigrations create --name create_users

Run migration against database:

    dbmigrations migrate --url postgres://localhost/test

Passwords can be read from `~/.pgpass` file.

You can also create js-based migration file with `--js` flag.

Use `dbmigrations --help` or `dbmigrations migrate --help` for sub-commands to get more info.

## Configuration

You can create `./.dbmigrations.json` configuration file. You can define environments (a list of urls):

    {
      "envs": {
        "dev": [
          "postgres://localhost/test1",
          "postgres://localhost/test2"
        ],
        "staging": [
          "postgres://staging/test1",
          "postgres://staging/test2"
        ]
      }
    }

To run migrations for all databases defined in environment use:

    dbmigrations migrate --env dev

## Notes

* currently only postgres is supported
* currently there's no support for down-migrating

If you're interested in any of those (or you think something else is missing) please create an issue or pull request.

## License

MIT
