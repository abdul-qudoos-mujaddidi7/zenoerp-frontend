import DashboardLayout from "./layouts/DashboardLayout.svelte";
import Home from "./layouts/Home.svelte";
import Login from './auth/Login.svelte';
import Register from './auth/Register.svelte';
import POS from './pages/POS.svelte';

export default {
  "/": Home,
  "/login": Login,
  "/register": Register,
  "/dashboard": DashboardLayout,
  "/video": Home,
  "/pos": POS,
  "/dashboard/*": DashboardLayout
};
