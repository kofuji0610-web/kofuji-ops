import { Switch, Route } from "wouter";
import { DashboardLayout } from "./components/DashboardLayout";
import Home from "./pages/Home";
import Reports from "./pages/Reports";
import ReportNew from "./pages/ReportNew";
import ReportDetail from "./pages/ReportDetail";
import Attendance from "./pages/Attendance";
import Schedule from "./pages/Schedule";
import Profile from "./pages/Profile";
import AdminUsers from "./pages/admin/Users";
import MaintenanceList from "./pages/MaintenanceList";
import MaintenanceReport from "./pages/MaintenanceReport";
import MaintenanceDetail from "./pages/MaintenanceDetail";
import PurchaseApproval from "./pages/PurchaseApproval";
import PurchaseDashboard from "./pages/PurchaseDashboard";
import PaintingSales from "./pages/PaintingSales";
import DroneSales from "./pages/DroneSales";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

function AuthenticatedRoutes() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/reports" component={Reports} />
        <Route path="/reports/new" component={ReportNew} />
        <Route path="/reports/:id" component={ReportDetail} />
        <Route path="/attendance" component={Attendance} />
        <Route path="/schedule" component={Schedule} />
        <Route path="/profile" component={Profile} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/maintenance" component={MaintenanceList} />
        <Route path="/maintenance/new" component={MaintenanceReport} />
        <Route path="/maintenance/:id" component={MaintenanceDetail} />
        <Route path="/purchase" component={PurchaseApproval} />
        <Route path="/purchase/dashboard" component={PurchaseDashboard} />
        <Route path="/painting-sales" component={PaintingSales} />
        <Route path="/drone-sales" component={DroneSales} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route component={AuthenticatedRoutes} />
    </Switch>
  );
}

export default function App() {
  return <AppRoutes />;
}
