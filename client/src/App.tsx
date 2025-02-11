import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Home from "@/pages/home";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Home />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;