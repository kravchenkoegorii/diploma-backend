import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1748175485060 implements MigrationInterface {
  name = 'Initial1748175485060';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "wallet_balances" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "wallet_id" uuid NOT NULL, "balance" character varying NOT NULL, "block_number" bigint NOT NULL, "chain_id" integer NOT NULL, CONSTRAINT "PK_eebe2c6f13f1a2de3457f8a885c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fcb4946ccb3dcc1a7263333da3" ON "wallet_balances" ("wallet_id", "block_number", "chain_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "wallets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "address" character varying NOT NULL, "isDefault" boolean NOT NULL DEFAULT false, "userId" uuid, CONSTRAINT "UQ_f907d5fd09a9d374f1da4e13bd3" UNIQUE ("address"), CONSTRAINT "PK_8402e5df5a30a229380e83e4f7e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."messages_sendertype_enum" AS ENUM('USER', 'AI', 'TOOL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "content" text, "senderType" "public"."messages_sendertype_enum" NOT NULL, "tool_calls" jsonb, "chatId" uuid, CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "chats" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" character varying NOT NULL, "userId" uuid, CONSTRAINT "PK_0117647b3c4a4e5ff198aeb6206" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying, "phone" character varying, "privy_id" character varying, "should_execute_actions_without_confirmation" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_cfe0816e9d0ed0ca7028e2bf581" UNIQUE ("privy_id"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "knowledge" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "key" character varying NOT NULL, "value" character varying NOT NULL, CONSTRAINT "UQ_f11c10413aab69c09237cd85b18" UNIQUE ("key"), CONSTRAINT "PK_4159ba98b65a20a8d1f257bc514" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "token_prices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "address" character varying(100) NOT NULL, "price" character varying NOT NULL, "block_number" bigint NOT NULL, "chain_id" integer NOT NULL, CONSTRAINT "PK_42e2a1a31b88976beb8421f80f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d3625d825666161530f05be64f" ON "token_prices" ("address", "block_number", "chain_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_balances" ADD CONSTRAINT "FK_df71d0f9058318ebc25302aa365" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD CONSTRAINT "FK_2ecdb33f23e9a6fc392025c0b97" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chats" ADD CONSTRAINT "FK_ae8951c0a763a060593606b7e2d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chats" DROP CONSTRAINT "FK_ae8951c0a763a060593606b7e2d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "messages" DROP CONSTRAINT "FK_36bc604c820bb9adc4c75cd4115"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallets" DROP CONSTRAINT "FK_2ecdb33f23e9a6fc392025c0b97"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_balances" DROP CONSTRAINT "FK_df71d0f9058318ebc25302aa365"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d3625d825666161530f05be64f"`,
    );
    await queryRunner.query(`DROP TABLE "token_prices"`);
    await queryRunner.query(`DROP TABLE "knowledge"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "chats"`);
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP TYPE "public"."messages_sendertype_enum"`);
    await queryRunner.query(`DROP TABLE "wallets"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fcb4946ccb3dcc1a7263333da3"`,
    );
    await queryRunner.query(`DROP TABLE "wallet_balances"`);
  }
}
