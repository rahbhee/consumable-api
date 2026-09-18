import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { faker } from "@faker-js/faker";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// Repeatable: running this twice does not produce duplicates. Rather than
// upserting by a natural key, this clears the four tables it owns (in
// dependency order -- order items before orders and products, products
// before categories) and re-inserts fresh every time. Simpler to reason
// about correctly than a partial-upsert story, and appropriate here
// because this is seed data for a demo API, not production data anyone
// depends on being preserved across reseeds.
async function main() {
  console.log("Clearing existing seed data...");
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();

  console.log("Seeding categories...");
  const categoryNames = [
    "Electronics",
    "Home and Kitchen",
    "Books",
    "Clothing",
    "Sports and Outdoors",
    "Toys and Games",
    "Beauty",
    "Garden",
  ];
  const categories = await Promise.all(
    categoryNames.map((name) =>
      db.category.create({
        data: { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") },
      })
    )
  );

  console.log("Seeding products...");
  const products = [];
  for (const category of categories) {
    const count = faker.number.int({ min: 35, max: 50 });
    for (let i = 0; i < count; i++) {
      products.push(
        await db.product.create({
          data: {
            categoryId: category.id,
            name: faker.commerce.productName(),
            description: faker.commerce.productDescription(),
            priceMinorUnits: faker.number.int({ min: 500, max: 50000 }),
            currency: "USD",
            stockQuantity: faker.number.int({ min: 0, max: 200 }),
            imageUrl: faker.image.urlLoremFlickr({ category: "product" }),
          },
        })
      );
    }
  }
  console.log(`Seeded ${products.length} products.`);

  console.log("Seeding orders...");
  const statuses = ["pending", "paid", "shipped", "cancelled"] as const;
  let orderCount = 0;
  for (let i = 0; i < 150; i++) {
    const itemCount = faker.number.int({ min: 1, max: 4 });
    const chosenProducts = faker.helpers.arrayElements(products, itemCount);
    const items = chosenProducts.map((p) => ({
      productId: p.id,
      quantity: faker.number.int({ min: 1, max: 3 }),
      unitPriceMinorUnits: p.priceMinorUnits,
    }));
    const totalMinorUnits = items.reduce((sum, it) => sum + it.unitPriceMinorUnits * it.quantity, 0);

    await db.order.create({
      data: {
        customerName: faker.person.fullName(),
        customerEmail: faker.internet.email(),
        status: faker.helpers.arrayElement(statuses),
        totalMinorUnits,
        items: { create: items },
      },
    });
    orderCount++;
  }
  console.log(`Seeded ${orderCount} orders.`);

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
