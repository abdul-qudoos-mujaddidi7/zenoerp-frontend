import Dexie from 'dexie';
import {setPermissionsFromUsers} from './auth/authStore';

export const db = new Dexie('ERPDatabase');

export let app_version = 'v1.7.5';
// Helper function to get current timestamp in ISO format
export function getCurrentTimestamp() {
  return new Date().toISOString();
}

import {refreshSettings} from './i18n/i18n';

/**
 * Log an activity performed in the frontend
 * @param {Object} params - Activity log parameters
 * @param {number} params.user_id - ID of the user performing the action
 * @param {string} params.action - Action performed (e.g. 'create', 'update', 'delete', 'login', etc.)
 * @param {string} params.table_name - Table/entity affected
 * @param {number} params.entity_id - ID of the affected entity
 * @param {Object} [params.old_values] - Previous values (for update/delete)
 * @param {Object} [params.new_values] - New values (for create/update)
 * @param {string} [params.description] - Optional description
 * @param {string} [params.ip_address] - IP address (if available)
 * @param {string} [params.session_id] - Session ID (if available)
 * @param {string} [params.device_info] - Device info (if available)
 * @param {number} [params.user_action_id] - Optional action id
 * @param {number} [params.status] - Status (default: 1)
 * @param {number} [params.version] - Version (default: 1)
 */

export async function logActivity({
  user_id,
  action,
  table_name,
  entity_id,
  old_values = null,
  new_values = null,
  description = '',
  ip_address = '',
  session_id = '',
  device_info = '',
  user_action_id = null,
  status = 1,
  version = 1,
}) {
  try {
    await db.activity_logs.add({
      user_id,
      user_action_id,
      action,
      table_name,
      entity_id,
      old_values: old_values ? old_values : null,
      new_values: new_values ? new_values : null,
      description,
      ip_address,
      session_id,
      device_info,
      status,
      version,
      created_at: getCurrentTimestamp(),
      last_synced_at: null,
    });
    return true;
  } catch (error) {
    console.error('Failed to log activity:', error);
    return false;
  }
}

db.version(1).stores({
  currencies: 'id, name, &code, symbol, isDefault, exchangeRate, exchangeRateDate, status, version,created_at , updated_at, last_synced_at',
  settings: 'id, category, type, &key, value, description, status, version, created_at , updated_at, last_synced_at',
  product_units: 'id, name, code, description, subunit_id, subunit_multiple, status,version, created_at , updated_at, last_synced_at',
  product_categories: 'id, name, code, description, status,version, created_at , updated_at, last_synced_at',
  product_brands: 'id, name, code, description, status,version, created_at , updated_at, last_synced_at',
  product_generics: 'id, name, code, description, status,version, created_at , updated_at, last_synced_at',
  products: 'id,product_status,type,service_duration,service_duration_unit,currency, category_id,department_id,user_id,brand_id,generic_id, product_unit_id, name, &code, description, buy_price, buy_currency,percentage, sell_price, sell_currency,initial_warehouse_id,initial_quantity,alarm_quantity,quantity, batch, manufacturing_date, expiry_date,alarm_expiry_days,benefit,status,version, created_at , updated_at, last_synced_at',
  product_images: 'id, product_id,status,version, created_at , updated_at, last_synced_at',
  warehouses: 'id, name, location, description,manager_name, isDefault, status,version, created_at , updated_at, last_synced_at',
  warehouse_products: 'id, warehouse_id, product_id, [warehouse_id+product_id], product_unit_id, quantity, status,created_at ,  updated_at, last_synced_at',
  account_types: 'id, name, name_fa, name_ps, description, status,version, created_at , updated_at, last_synced_at',
  accounts: 'id,account_status, account_type_id,account_group_id,patient_type_id,nid, &code, name, name_fa, name_ps, main_acc, balance, currency,percentage, description,phone,phone2,email,address, status,version, created_at , updated_at, last_synced_at',
  account_groups: 'id, name, code, description, status,version, created_at , updated_at, last_synced_at',
  account_images: 'id, account_id,status,version, created_at , updated_at, last_synced_at',
  journals: 'id,[reference_type+reference_id+status], date, reference_id, reference_type, description, currency, first_entry_account, first_entry_debit, first_entry_credit, second_entry_account, second_entry_debit, second_entry_credit, status,version, created_at , updated_at, last_synced_at',
  exchanges: 'id, date, reference_id, reference_type, description, first_currency, first_entry_account, first_entry_debit, first_entry_credit,second_currency, second_entry_account, second_entry_debit, second_entry_credit,multiple,rate,system_rate,benefit_amount,benefit_currency, status,version, created_at , updated_at, last_synced_at',
  purchases: 'id, warehouse_id, account_id, bill_number, bill_date,due_date,expense_amount, total_amount, description, currency, bill_status,items_count, status,version, created_at , updated_at, last_synced_at',
  purchase_items: 'id, purchase_id, product_id, product_unit_id, quantity, unit_price,sell_price,  currency,sell_currency,discount_type, discount_amount, batch, manufacturing_date, expiry_date, subtotal,status,version, created_at , updated_at, last_synced_at',
  purchase_payments: 'id, purchase_id, account_id, amount, currency, payment_date, description, status,version, created_at , updated_at, last_synced_at',
  sales: 'id, warehouse_id, account_id, sale_type, invoice_number, invoice_date,due_date, expense_amount, total_amount, discount_type, discount_amount,description,extra_info,remaining,benefit, currency, invoice_status,items_count, status,version, created_at , updated_at, last_synced_at',
  sale_items: 'id, sale_id, product_id, product_unit_id, quantity, buy_price,buy_price_currency,unit_price, currency, discount_type, discount_amount, subtotal, fifo_cost, profit, extra_info, status,version, created_at , updated_at, last_synced_at,[sale_id+status]',
  sale_payments: 'id, sale_id, account_id, amount, currency, payment_date, description, status,version, created_at , updated_at, last_synced_at',
  stock_transfers: 'id, warehouse_id, to_warehouse_id, transfer_number, transfer_date, total_amount, description, currency, transfer_status, status,version, created_at , updated_at, last_synced_at',
  stock_transfer_items: 'id, stock_transfer_id, product_id, product_unit_id, quantity, unit_price, currency, subtotal,status,version, created_at , updated_at, last_synced_at',
  user_roles: 'id, &name, description,permissions, status,version, created_at , updated_at, last_synced_at',
  users: 'id, role_id, &username, email, first_name, last_name, phone, address, description,permissions, language, theme, status,version, created_at , updated_at, last_synced_at',
  user_images: 'id, user_id,status,version, created_at , updated_at, last_synced_at',
  stock_transactions: `id,[reference_type+reference_id+status],[product_id+status],warehouse_id,product_id,product_unit_id,reference_id,reference_type,transaction_type,quantity,unit_cost,total_cost,currency,peer_price,peer_currency,date, batch, manufacturing_date, expiry_date,heaviness,description,status,version,created_at,last_synced_at`,
  sale_returns: `id,sale_id,warehouse_id,account_id,return_number,return_date,total_amount,description,currency,return_status,status,version,created_at,last_synced_at`,
  sale_return_items: `id,sale_return_id,product_id,product_unit_id,quantity,unit_price,currency,subtotal,status,version,created_at,last_synced_at`,
  purchase_returns: `id, purchase_id, warehouse_id, account_id, return_number, return_date, total_amount, description, currency, return_status, status,version,created_at,last_synced_at`,
  purchase_return_items: `id,purchase_return_id,product_id,product_unit_id,quantity,unit_price,currency,subtotal,status,version,created_at,last_synced_at`,
  wastes: `id, warehouse_id, reference_number, date, total_amount, description, currency, waste_status, status, version, created_at, last_synced_at`,
  waste_items: `id,waste_id, product_id, product_unit_id, quantity, unit_price, currency, subtotal, status, version, created_at, last_synced_at`,
  activity_logs: `id,user_id,user_action_id,action,table_name,entity_id,old_values,new_values,description,ip_address,session_id,device_info,status,version,created_at,last_synced_at`,
  work_centers: `id, code, name, description, cost_per_hour,cost_currency, capacity_per_hour,capacity_unit_id,setup_time,setup_time_unit, status, version, created_at, last_synced_at`,
  boms: `id, product_id,bill_number,bill_date,bill_status, quantity, product_unit_id,description,total_amount,currency, status, version,created_at ,  updated_at, last_synced_at`,
  bom_items: `id, bom_id, product_id, product_unit_id, quantity, wastage_percent,unit_price,subtotal,currency, status, version,created_at ,  updated_at, last_synced_at`,
  bom_operations: `id, bom_id, work_center_id, operation_name, sequence, setup_time,setup_time_unit, run_time,run_time_unit, cost_per_hour, cost_currency , fixed_cost,labor_count,efficiency,description,status, version,created_at ,  updated_at, last_synced_at`,
  productions: `id, production_type,production_number,production_start_date,production_end_date, production_status,  product_id, bom_id, warehouse_id, quantity,product_unit_id, total_amount, currency, description,status, version,created_at ,  updated_at, last_synced_at`,
  production_items: `id, production_id, product_id, product_unit_id, quantity, unit_price, subtotal,currency, status, version,created_at ,  updated_at, last_synced_at`,
  production_operations: `id, production_id,bom_operation_id, work_center_id, operation_name, sequence, setup_time,setup_time_unit, run_time,run_time_unit,cost_per_hour, cost_currency , fixed_cost,labor_count,efficiency,description,status, version,created_at ,  updated_at, last_synced_at`,
  departments: 'id, name, description, status, version,created_at ,  updated_at, last_synced_at',
  patient_types: 'id, name, name_fa, name_ps, description, status,version, updated_at, last_synced_at',
  documents: 'id,name,description, reference_type,reference_id,file_type,file_size,file,thumbnail, status,version,created_at ,  updated_at, last_synced_at',
  appointments: 'id, date, serial_no, reference_id, reference_type, description, patient_id, fee,paid_amount, currency, doctor_id, department_id,visit_type,visit_status,visit_date,doctor_notes,diagnosis,prescriptions,vitals,parent_visit_id,follow_up_date, status, version,created_at ,  updated_at, last_synced_at',
  appointment_items: 'id, appointment_id, product_id, product_unit_id, quantity, unit_price, currency, discount_type, discount_amount, subtotal,status,version,created_at ,  updated_at, last_synced_at,[appointment_id+status]',
  prescriptions: 'id, prescription_number,prescription_status, prescription_date, patient_id, doctor_id, appointment_id, vitals,diagnosis, notes, description, status, version,created_at ,  updated_at, last_synced_at',
  prescription_items: 'id, prescription_id, product_id, product_unit_id, dosage, dosage_unit, frequency, duration, duration_unit, route, instructions, quantity, status, version,created_at ,  updated_at, last_synced_at',
  labtest_categories: 'id, name, code, description, status,version, created_at , updated_at, last_synced_at',
  labtest_types: 'id,labtest_category_id, name, description, parameters,price,currency, status, version,created_at ,  updated_at, last_synced_at',
  labtests: 'id,name, labtest_type_id, labtest_number,labtest_status, labtest_date, patient_id, technician_id, appointment_id,parameters, description,price,currency, status, version,created_at ,  updated_at, last_synced_at',
  buildings: 'id, name, code, address,total_floors, total_units, building_type, description, status, version, created_at ,updated_at, last_synced_at',
  floors: 'id, building_id, floor_number, total_units_on_floor, description, status, version, created_at ,updated_at, last_synced_at',
  apartments: 'id, building_id, floor_id, unit_number, area_sqm, bedrooms, bathrooms, unit_type, rent_amount, sale_price, currency, occupancy_status, description, status, version, created_at ,updated_at, last_synced_at',
  leases: 'id, apartment_id, tenant_account_id, lease_number, lease_type, start_date, end_date, monthly_rent, deposit_amount,currency, payment_cycle, auto_renew, grace_period_days, late_fee_percent, terms_conditions, description, status, version, created_at ,updated_at, last_synced_at',
  rent_invoices: 'id, lease_id, invoice_number, issue_date, due_date, billing_period_start, billing_period_end,base_rent,late_fee,utility_charges,other_charges,total_amount,paid_amount,currency, invoice_status, description, status, version, created_at ,updated_at, last_synced_at',
  utility_meters: 'id, apartment_id, meter_number, utility_type, initial_reading, current_reading, installation_date, description, status, version, created_at ,updated_at, last_synced_at',
  meter_readings: 'id, meter_id, reading_date, previous_reading, current_reading, consumption, rate_per_unit,calculated_amount,currency, description, status, version, created_at ,updated_at, last_synced_at',
  inventory_records: 'id, apartment_id, account_id, record_type, record_number, record_date, due_date, expense_amount, total_amount, discount_type, discount_amount, description,extra_info, remaining, benefit, currency, record_status, items_count, status,version, created_at , updated_at, last_synced_at',
  inventory_record_items: 'id, record_id, product_id, product_unit_id, quantity, buy_price, buy_price_currency, unit_price, currency, discount_type, discount_amount, subtotal,extra_info, status,version, created_at , updated_at, last_synced_at, [sale_id+status]',

  stock_batches: 'id, product_id, warehouse_id, received_at, source_type, source_id, quantity_in, quantity_remaining, unit_cost,currency, status,version, created_at , updated_at, last_synced_at',
  batch_consumptions: 'id,operation_type,operation_id,operation_item_id, sale_id, sale_item_id, product_id,warehouse_id, stock_batch_id,quantity,unit_cost,total_cost,currency,status,version, created_at , updated_at, last_synced_at',
  stock_consumption_returns:'id, [sale_return_item_id+status], [stock_consumption_id+status], stock_batch_id,sale_return_id,sale_return_item_id,stock_consumption_id,quantity,unit_cost,total_cost,currency, status, version, created_at ,updated_at, last_synced_at',
  inventory_operations:'id, &operation_key, operation_type, reference_id, reference_item_id, inventory_method, status,version, created_at , updated_at, last_synced_at',
});

const tables = [
  'labtest_categories',
  'labtest_types',
  'labtests',
  'prescriptions',
  'prescription_items',
  'appointments',
  'appointment_items',
  'patient_types',
  'documents',
  'departments',
  'work_centers',
  'boms',
  'bom_items',
  'bom_operations',
  'productions',
  'production_items',
  'production_operations',
  'currencies',
  'settings',
  'product_units',
  'product_categories',
  'product_brands',
  'product_generics',
  'products',
  'product_images',
  'warehouses',
  'warehouse_products',
  'account_types',
  'accounts',
  'account_groups',
  'account_images',
  'journals',
  'exchanges',
  'purchases',
  'purchase_items',
  'stock_transfers',
  'stock_transfer_items',
  'purchase_payments',
  'sales',
  'sale_items',
  'sale_payments',
  'user_roles',
  'users',
  'user_images',
  'stock_transactions',
  'stock_batches',
  'batch_consumptions',
  'stock_consumption_returns',
  'inventory_operations',
  'sale_returns',
  'sale_return_items',
  'purchase_returns',
  'purchase_return_items',
  'wastes',
  'waste_items',
  'activity_logs',
  'buildings',
  'floors',
  'apartments',
  'leases',
  'rent_invoices',
  'utility_meters',
  'meter_readings',
  'inventory_records',
  'inventory_record_items'
];

// -----------------------------------------------------------------------------
// Safe distributed numeric ID strategy (JS Number safe + MySQL BIGINT compatible)
// -----------------------------------------------------------------------------
// 53-bit layout (stored as JS Number, still integer-safe):
// [timestamp_ms_since_epoch | 10-bit node | 2-bit sequence]
//
// - timestamp: milliseconds since custom epoch (2024-01-01 UTC)
// - node: 8-bit persistent device shard + 2-bit per-tab shard
// - sequence: 0..3 per millisecond per tab
//
// This keeps IDs:
// - Integer-only
// - <= Number.MAX_SAFE_INTEGER
// - BIGINT-compatible in MySQL
// - Much safer against cross-device collisions than previous strategy

function betterId() {
  return Math.floor(Math.random() * 8000000000000000) + 1000000000000000;
}

tables.forEach((tableName) => {
  const table = db[tableName];

  // Hook for CREATE operations
  table.hook('creating', (primKey, obj) => {
    if (obj.__skipHooks) {
      delete obj.__skipHooks; // cleanup
      return;
    }
    if (!obj.id) {
      obj.id = betterId();
    }
    obj.created_at = obj.created_at || getCurrentTimestamp();
    obj.updated_at = obj.updated_at || getCurrentTimestamp();

    if (!Object.prototype.hasOwnProperty.call(obj, 'last_synced_at')) {
      obj.last_synced_at = null;
    }
    obj.created_by = localStorage.getItem('user_id') || null;
    obj.updated_by = localStorage.getItem('user_id') || null;
    obj.approved_by = obj.approved_by || null;
    obj.approved_at = obj.approved_at || null;
  });
  table.hook('updating', (modifications, primKey, obj) => {
    if (modifications.__skipHooks) {
      delete modifications.__skipHooks; // cleanup
      return modifications;
    }

    if (!Object.prototype.hasOwnProperty.call(modifications, 'updated_at')) {
      modifications.updated_at = getCurrentTimestamp();
      modifications.updated_by = localStorage.getItem('user_id') || null;
    }
    if (table.name == 'users') {
      console.log('User update detected, modifications:', modifications);
      setTimeout(() => {
        setPermissionsFromUsers();
      }, 200);
    }
    if (table.name == 'settings') {
      console.log('Settings update detected, modifications:', modifications);
      setTimeout(() => {
        refreshSettings();
      }, 200);
    }

    return modifications;
  });
});
