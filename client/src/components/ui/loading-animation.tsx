import { motion } from "framer-motion";

export function ConnectingPulse() {
  return (
    <motion.div
      className="w-24 h-24 rounded-full bg-primary/20 absolute"
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{
        scale: [1, 1.5, 1],
        opacity: [0.3, 0.1, 0.3],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

export function SearchingAnimation() {
  return (
    <div className="relative flex items-center justify-center">
      <ConnectingPulse />
      <motion.div
        className="w-16 h-16 rounded-full bg-primary relative z-10 flex items-center justify-center"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", bounce: 0.5 }}
      >
        <motion.div
          className="w-8 h-8 border-4 border-primary-foreground rounded-full border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </motion.div>
    </div>
  );
}

export function ConnectionIndicator({ isConnected }: { isConnected: boolean }) {
  return (
    <motion.div
      className={`h-3 w-3 rounded-full ${
        isConnected ? "bg-green-500" : "bg-gray-300"
      }`}
      initial={{ scale: 0.5 }}
      animate={{
        scale: isConnected ? [1, 1.2, 1] : 1,
        opacity: isConnected ? 1 : 0.5,
      }}
      transition={{
        duration: 1,
        repeat: isConnected ? Infinity : 0,
        repeatType: "reverse",
      }}
    />
  );
}
