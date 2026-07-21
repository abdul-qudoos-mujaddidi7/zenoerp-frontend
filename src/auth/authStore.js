import { db } from '../db';
import { writable, get  } from 'svelte/store';

export const auth = writable({
  token: localStorage.getItem('token'),
  user_id: localStorage.getItem('user_id'),
  org_id: localStorage.getItem('org_id'),
  username: localStorage.getItem('username'),
  role_id: localStorage.getItem('role_id'),
  subscription: localStorage.getItem('subscription'),
  permissions: JSON.parse(localStorage.getItem('permissions') || "[]"),
  isAuthenticated: !!localStorage.getItem('token'),
});


export async function setPermissionsFromUsers() {
  console.log("Setting permissions from users table...",get(auth).user_id);
  try {
    let user = await db.users.where('id').equals(Number(get(auth).user_id)).first();
    console.log("Fetched user for permissions:", user);
    if (user && user.permissions) {
      const perms = user.permissions ? JSON.parse(user.permissions) : [];

      localStorage.setItem("permissions", JSON.stringify(perms));

auth.update(v => ({
  ...v,
  permissions: perms
}));
      console.log("Permissions updated from users table:", user.permissions);
    }
  } catch (error) {
    console.error('Error fetching user permissions:', error);
  }
}
