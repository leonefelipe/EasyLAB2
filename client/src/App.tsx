import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import LinkedInPage from "./pages/LinkedInPage";
import ClientDashboard from "./pages/ClientDashboard";

function Router() {
  return (
    <Switch>
      {/* CRM dashboard is the default entry point for the internal tool */}
      <Route path={"/"} component={ClientDashboard} />
      <Route path={"/clients"} component={ClientDashboard} />
      <Route path={"/analysis"} component={Home} />
      <Route path={"/linkedin"} component={LinkedInPage} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
