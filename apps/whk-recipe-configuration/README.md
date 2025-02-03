<p align="right">
  <a href="https://amplication.com" target="_blank">
    <img alt="amplication-logo" height="70" alt="Amplication Logo" src="https://amplication.com/images/logo.svg"/>
  </a>
</p>

# Introduction

This service was generated with Amplication. The server-side of the generated project. This component provides the different backend services - i.e., REST API, GraphQL API, authentication, authorization, logging, data validation and the connection to the database. Additional information about the server component and the architecture around it, can be found on the [documentation](https://docs.amplication.com/guides/getting-started) site.

# Getting started

## Step 1: Configuration

Configuration for the server component can be provided through the use of environment variables. These can be passed to the application via the use of the `.env` file in the base directory of the generated service. Below a table can be found which show the different variables that can be passed - these are the variables which exist by default, through the use of plugins additional integrations could require additional values. These values are provided default values after generation, change them to the desired values.

| Variable             | Description                                  | Value                                                               |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| BCRYPT_SALT          | the string used for hashing                  | [random-string]                                                     |
| COMPOSE_PROJECT_NAME | the identifier of the service plus prefix    | amp\_[service-identifier]                                           |
| PORT                 | the port on which to run the server          | 3000                                                                |
| DB_URL               | the connection url for the database          | [db-provider]://[username]:[password]@localhost:[db-port]/[db-name] |
| DB_PORT              | the port used by the database instance       | [db-provider-port]                                                  |
| DB_USER              | the username used to connect to the database | [username]                                                          |
| DB_PASSWORD          | the password used to connect to the database | [password]                                                          |
| DB_NAME              | the name of the database                     | [service-name] / [project-name]                                     |
| JWT_SECRET_KEY       | the secret used to sign the json-web token   | [secret]                                                            |
| JWT_EXPIRATION       | the expiration time for the json-web token   | 2d                                                                  |

> **Note**
> Amplication generates default values and stores them under the .env file. It is advised to use some form of secrets manager/vault solution when using in production.

## Step 2: DotEnv Vault (Environment variables)

We utilize the [DotEnv Vault](https://dotenv.org/) platform to store the environment variables in a secure and easily manageable way for different environments.

### Local Development

From the root of the app directory (in this case `apps/whk-recipe-configuration`) run the following command to start the dotenv vault:

`npx dotenv-vault@latest pull`

### Staging

From the root of the app directory (in this case `apps/whk-recipe-configuration`) run the following command to start the dotenv vault:
`npx dotenv-vault@latest pull staging .env`

### Production

From the root of the app directory (in this case `apps/whk-recipe-configuration`) run the following command to start the dotenv vault:
`npx dotenv-vault@latest pull production .env`

Please see their documentation for more information.

## Step 3.1: Scripts - pre-requisites

After configuration of the server the next step would be to run the application. Before running the server side of the component, make sure that the different pre-requisites are met - i.e., node.js [^16.x], npm, docker. After the setup of the pre-requisites the server component can be started.

```sh
# installation of the dependencies
$ npm install

# generate the prisma client
$ npm run prisma:generate
```

## Step 3.2: Scripts - local development

```sh
# start the database where the server component will connect to
$ npm run docker:dev

# initialize the database
$ npm run db:dev:init

# start the server component
$ npm run start
```

By default, your app comes with one user with the username and password configured in
`.env` file. See step 2 for more details.

## Step 3.3: Scripts - container based development

```shell
# start the server component as a docker container
$ npm run compose:up
```

## 4 - Database Restoration for Local Development

If you are developing locally and need to restore the database, you can use the following command:

Note you must have the `psql` command installed on your machine.

- [Guide](https://www.timescale.com/blog/how-to-install-psql-on-mac-ubuntu-debian-windows/)

Commands:

```sh
dropdb -h localhost -p 5432 -U admin whk-mes # drop if exists
createdb -h localhost -p 5432 -U admin whk-mes # create new db
psql -h localhost -p 5432 -d whk-mes -U admin -f <pathToMy.sqlFileToRestore> # Restore from .sql file
```

# QuickStart application

```bash
npm install
npm run prisma:generate
npm run docker:dev
npm run db:dev:uselotsofcautionclean
npm run db:prod:deploy
npm run seed
npm run start
```

# Start up guide for csv loader

```bash
# navigate to the whk-mes-csv-loader directory  for 'development' and navigate to the 'prod' directory for 'production' within the whk-mes-csv-loader directory

# for development
node index.js

# for production once you are in the prod directory
node  prod-index.js
```
