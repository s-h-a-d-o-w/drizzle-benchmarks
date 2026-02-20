import { EntitySchema } from 'typeorm';

type Customer = {
  id: number;
  companyName: string;
  contactName: string;
  contactTitle: string;
  address: string;
  city: string;
  postalCode: string | null;
  region: string | null;
  country: string;
  phone: string;
  fax: string | null;
};

type Employee = {
  id: number;
  lastName: string;
  firstName: string | null;
  title: string;
  titleOfCourtesy: string;
  birthDate: Date;
  hireDate: Date;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  homePhone: string;
  extension: number;
  notes: string;
  recipientId: number | null;
  recipient?: Employee | null;
  reporters?: Employee[];
};

type Supplier = {
  id: number;
  companyName: string;
  contactName: string;
  contactTitle: string;
  address: string;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
  phone: string;
  products?: Product[];
};

type Product = {
  id: number;
  name: string;
  quantityPerUnit: string;
  unitPrice: number;
  unitsInStock: number;
  unitsOnOrder: number;
  reorderLevel: number;
  discontinued: number;
  supplierId: number;
  supplier?: Supplier;
};

type Order = {
  id: number;
  orderDate: Date;
  requiredDate: Date;
  shippedDate: Date | null;
  shipVia: number;
  freight: number;
  shipName: string;
  shipCity: string;
  shipRegion: string | null;
  shipPostalCode: string | null;
  shipCountry: string;
  customerId: number;
  employeeId: number;
  details?: Detail[];
};

type Detail = {
  unitPrice: number;
  quantity: number;
  discount: number;
  orderId: number;
  productId: number;
  order?: Order;
  product?: Product;
};

export const CustomerEntity = new EntitySchema<Customer>({
  name: 'Customer',
  tableName: 'customers',
  columns: {
    id: { type: Number, primary: true, generated: true },
    companyName: { type: String, name: 'company_name' },
    contactName: { type: String, name: 'contact_name' },
    contactTitle: { type: String, name: 'contact_title' },
    address: { type: String },
    city: { type: String },
    postalCode: { type: String, name: 'postal_code', nullable: true },
    region: { type: String, nullable: true },
    country: { type: String },
    phone: { type: String },
    fax: { type: String, nullable: true },
  },
});

export const EmployeeEntity = new EntitySchema<Employee>({
  name: 'Employee',
  tableName: 'employees',
  columns: {
    id: { type: Number, primary: true, generated: true },
    lastName: { type: String, name: 'last_name' },
    firstName: { type: String, name: 'first_name', nullable: true },
    title: { type: String },
    titleOfCourtesy: { type: String, name: 'title_of_courtesy' },
    birthDate: { type: Date, name: 'birth_date' },
    hireDate: { type: Date, name: 'hire_date' },
    address: { type: String },
    city: { type: String },
    postalCode: { type: String, name: 'postal_code' },
    country: { type: String },
    homePhone: { type: String, name: 'home_phone' },
    extension: { type: Number },
    notes: { type: String },
    recipientId: { type: Number, name: 'recipient_id', nullable: true },
  },
  relations: {
    recipient: {
      type: 'many-to-one',
      target: 'Employee',
      joinColumn: { name: 'recipient_id', referencedColumnName: 'id' },
      inverseSide: 'reporters',
      nullable: true,
    },
    reporters: {
      type: 'one-to-many',
      target: 'Employee',
      inverseSide: 'recipient',
    },
  },
});

export const SupplierEntity = new EntitySchema<Supplier>({
  name: 'Supplier',
  tableName: 'suppliers',
  columns: {
    id: { type: Number, primary: true, generated: true },
    companyName: { type: String, name: 'company_name' },
    contactName: { type: String, name: 'contact_name' },
    contactTitle: { type: String, name: 'contact_title' },
    address: { type: String },
    city: { type: String },
    region: { type: String, nullable: true },
    postalCode: { type: String, name: 'postal_code' },
    country: { type: String },
    phone: { type: String },
  },
  relations: {
    products: {
      type: 'one-to-many',
      target: 'Product',
      inverseSide: 'supplier',
    },
  },
});

export const ProductEntity = new EntitySchema<Product>({
  name: 'Product',
  tableName: 'products',
  columns: {
    id: { type: Number, primary: true, generated: true },
    name: { type: String },
    quantityPerUnit: { type: String, name: 'qt_per_unit' },
    unitPrice: { type: Number, name: 'unit_price' },
    unitsInStock: { type: Number, name: 'units_in_stock' },
    unitsOnOrder: { type: Number, name: 'units_on_order' },
    reorderLevel: { type: Number, name: 'reorder_level' },
    discontinued: { type: Number },
    supplierId: { type: Number, name: 'supplier_id' },
  },
  relations: {
    supplier: {
      type: 'many-to-one',
      target: 'Supplier',
      joinColumn: { name: 'supplier_id', referencedColumnName: 'id' },
      inverseSide: 'products',
    },
  },
});

export const OrderEntity = new EntitySchema<Order>({
  name: 'Order',
  tableName: 'orders',
  columns: {
    id: { type: Number, primary: true, generated: true },
    orderDate: { type: Date, name: 'order_date' },
    requiredDate: { type: Date, name: 'required_date' },
    shippedDate: { type: Date, name: 'shipped_date', nullable: true },
    shipVia: { type: Number, name: 'ship_via' },
    freight: { type: Number },
    shipName: { type: String, name: 'ship_name' },
    shipCity: { type: String, name: 'ship_city' },
    shipRegion: { type: String, name: 'ship_region', nullable: true },
    shipPostalCode: { type: String, name: 'ship_postal_code', nullable: true },
    shipCountry: { type: String, name: 'ship_country' },
    customerId: { type: Number, name: 'customer_id' },
    employeeId: { type: Number, name: 'employee_id' },
  },
  relations: {
    details: {
      type: 'one-to-many',
      target: 'Detail',
      inverseSide: 'order',
    },
  },
});

export const DetailEntity = new EntitySchema<Detail>({
  name: 'Detail',
  tableName: 'order_details',
  columns: {
    unitPrice: { type: Number, name: 'unit_price' },
    quantity: { type: Number },
    discount: { type: Number },
    orderId: { type: Number, name: 'order_id', primary: true },
    productId: { type: Number, name: 'product_id', primary: true },
  },
  relations: {
    order: {
      type: 'many-to-one',
      target: 'Order',
      joinColumn: { name: 'order_id', referencedColumnName: 'id' },
      inverseSide: 'details',
    },
    product: {
      type: 'many-to-one',
      target: 'Product',
      joinColumn: { name: 'product_id', referencedColumnName: 'id' },
    },
  },
});
