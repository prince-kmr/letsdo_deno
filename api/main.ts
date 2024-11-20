// export function add(a: number, b: number): number {
//   return a + b;
// }

// // Learn more at https://docs.deno.com/runtime/manual/examples/module_metadata#concepts
// if (import.meta.main) {
//   console.log("Add 2 + 3 =", add(2, 3));
// }

// Importing some console colors
import { bold, cyan, green, yellow } from "jsr:@std/fmt@0.223/colors";

import {
  Application,
  type Context,
  isHttpError,
  Router,
  type RouterContext,
  Status,
} from "https://deno.land/x/oak@v17.1.2/mod.ts";

import { v4 as uuid } from "https://deno.land/std@0.117.0/uuid/mod.ts"; // For generating unique IDs

// Typecast
// var x = "32";
// var y: number = +x;
// Define Book interface
interface Book {
  id: string;
  title: string;
  author: string;
  genre: string;
  year: number;
  summary: string;
}

const books = new Map<string, Book>();

// CORS middleware
const cors = async (context: Context, next: () => Promise<unknown>) => {
  context.response.headers.set("Access-Control-Allow-Origin", "http://localhost:3000", ); // Allow requests from Next.js frontend
  context.response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"); // Set allowed methods
  context.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization"); // Set allowed headers

  if (context.request.method === "OPTIONS") {
    context.response.status = 204;
  } else {
    await next();
  }
};

// Function to load JSON data and populate a Map
async function loadBooksData(): Promise<void> {
  try {
    const data = await Deno.readTextFile("../data/simple_book.json");
    const jsonData = JSON.parse(data);

    jsonData.forEach((book: Book) => {
      books.set(book.id, book);
    });
  } catch (error) {
    console.error("Error reading books.json:", error);
  }
}

// Load books data initially
await loadBooksData();

// Not found handler
function notFound(context: Context) {
  context.response.status = Status.NotFound;
  context.response.body =
    `<html><body><h1>404 - Not Found</h1><p>Path <code>${context.request.url}</code> not found.`;
}

const router = new Router();
router
  // GET /books - Retrieve all books
  .get("/books", (context) => {
    context.response.body = Array.from(books.values());
  })
  // GET /books/:id - Retrieve a specific book by ID
  .get("/books/:id", (context) => {
    const bookId = context.params.id;
    const book = books.get(bookId);

    if (book) {
      context.response.body = book;
    } else {
      notFound(context);
    }
  })
  // POST /books - Add a new book
  .post("/books", async (context: RouterContext<"/books">) => {
    if (!context.request.hasBody) {
      context.throw(Status.BadRequest, "Bad Request: No data provided");
    }

    const body = context.request.body;
    const newBook: Partial<Book> = await body.json();

    if (!newBook.title || !newBook.author || !newBook.genre || !newBook.year || !newBook.summary) {
      context.throw(Status.BadRequest, "Bad Request: Missing required fields");
    }

    const id = (!newBook.id) ? uuid.generate(): newBook.id;  // Ternary Operator
    const book: Book = { id, ...newBook } as Book;
    books.set(id, book);

    context.response.status = Status.Created;
    context.response.body = book;
  })
  // PUT /books/:id - Update an existing book
  .put("/books/:id", async (context) => {
    const id = context.params.id;
    if (!id) {
      context.response.status = 400;
      context.response.body = { error: "ID is required" };
      return;
    }
  
    const body = context.request.body();
    const book = await body.value;
  
    if (!book || typeof book !== "object") {
      context.response.status = 400;
      context.response.body = { error: "Invalid book data" };
      return;
    }
  
    if (!books.has(id)) {
      context.response.status = 404;
      context.response.body = { error: "Book not found" };
      return;
    }
  
    books.set(id, { ...books.get(id), ...book });
    context.response.status = 200;
    context.response.body = { message: "Book updated successfully" };
  })
  
  // DELETE /books/:id - Delete a book by ID
  .delete("/books/:id", (context) => {
    const bookId = context.params.id;

    if (bookId && books.has(bookId)) {
      books.delete(bookId);
      context.response.status = Status.NoContent;
    } else {
      notFound(context);
    }
  });

// Initialize Oak application and add middleware
const app = new Application();

// Logger
app.use(async (context, next) => {
  await next();
  const rt = context.response.headers.get("X-Response-Time");
  console.log(
    `${green(context.request.method)} ${
      cyan(decodeURIComponent(context.request.url.pathname))
    } - ${bold(String(rt))}`
  );
});

// Response Time
app.use(async (context, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  context.response.headers.set("X-Response-Time", `${ms}ms`);
});

// Error handler
app.use(async (context, next) => {
  try {
    await next();
  } catch (err) {
    if (isHttpError(err)) {
      context.response.status = err.status;
      const { message, status, stack } = err;
      if (context.request.accepts("json")) {
        context.response.body = { message, status, stack };
        context.response.type = "json";
      } else {
        context.response.body = `${status} ${message}\n\n${stack ?? ""}`;
        context.response.type = "text/plain";
      }
    } else {
      console.log(err);
      throw err;
    }
  }
});

// Apply CORS, router, and 404 handler
app.use(cors);
app.use(router.routes());
app.use(router.allowedMethods());
app.use(notFound);

// Start the server
app.addEventListener("listen", ({ hostname, port, serverType }) => {
  console.log(bold("Start listening on ") + yellow(`${hostname}:${port}`));
  console.log(bold("  using HTTP server: " + yellow(serverType)));
});

await app.listen({ hostname: "127.0.0.1", port: 8000 });
console.log(bold("Finished."));
