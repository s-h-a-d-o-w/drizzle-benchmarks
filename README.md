# Drizzle Benchmarks
Drizzle has always been fast, we just wanted you to have a meaningful [benchmarks experience](orm.drizzle.team#benchmarks)  

We ran our benchmarks on 2 separate machines, so that observer does not influence results. For database we're using PostgreSQL instance with 42MB of E-commerce data(~370k records).  
K6 benchmarking instance lives on MacBook Air and makes [1M prepared requests](./data/requests.json) through 1GB ethernet to Lenovo M720q with Intel Core i3-9100T and 32GB of RAM.

![image](https://github.com/drizzle-team/drizzle-benchmarks/assets/4045375/103ae551-7708-4752-b3ed-5734adfe897f)


To run your own tests - follow instructions below!

## Prepare database
1. Spin up a docker container with PostgreSQL using `pnpm start:docker` command. You can configure a desired database port in `./src/docker.ts` file:
```ts
...
}

const desiredPostgresPort = 5432; // change here
main();
```
1. Update `DATABASE_URL` with allocated database port in .env file:
```env
DATABASE_URL="postgres://postgres:postgres@localhost:5432/postgres"
```
1. Seed your database with test data using `pnpm start:seed` command, you can change the size of the database in `./src/seed.ts` file:
```ts
...
}

main("micro"); // nano | micro
```

## Prepare test machine

1. Make sure you have Node version 18 installed or above, we've used Node v24. You can use [`nvm use 24`](https://github.com/nvm-sh/nvm) command
1. Start Drizzle/Prisma server:
```bash
## Drizzle
pnpm start:drizzle

## Prisma
pnpm prepare:prisma
pnpm start:prisma

## TypeORM
pnpm start:typeorm
```
1. Generate a list of http requests with `pnpm start:generate`. It will output a list of http requests to be run to `./data/requests.json`
1. Install [k6 load tester](https://k6.io/)
1. Run benchmarks 🚀
```bash
pnpm tsx bench/index --host http://<your server IP>:3000 --name my-bench --folder results
```
Default ports are:
- 3000 - drizzle
- 3001 - prisma
- 3002 - go
- 3003 - typeorm
1. After benchmarks finish, merge all outputs into a single JSON file:
```bash
pnpm tsx bench/prepare --folder results
```
