import mongoose from "mongoose";

const mailSchema = new mongoose.Schema({
  sender: {
    type: String,
    required: true,
    default: "Cozy Minds Team",
  },
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
    default: `
      <div style="padding: 1.5rem; border-radius: 12px; background-color: #FFF8E1; color: #4A3C31; font-family: 'Georgia', serif; line-height: 1.7; border: 2px solid #E8C7C7; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); position: relative;">
        <!-- Decorative flourish -->
        <div style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background-color: #FFF8E1; padding: 0 10px; color: #D4A5A5; font-size: 1.2rem;">✨</div>
        
        <!-- Greeting -->
        <h1 style="font-size: 1.5rem; color: #D4A5A5; font-weight: 600; margin-bottom: 1.5rem; text-align: center; font-family: 'Courier New', monospace;">
          Welcome to Cozy Minds, Dear Wanderer! 🌟
        </h1>

        <!-- Main message -->
        <p style="font-size: 1rem; color: #4A3C31; margin-bottom: 1.5rem;">
          A soft breeze whispers your arrival, and the stars above twinkle in delight.  
          You've found your way to <strong style="color: #D4A5A5;">Cozy Minds</strong>, a haven where thoughts bloom like wildflowers and stories dance in the moonlight.  
          <br><br>
          Curl up by our virtual hearth to:
          <ul style="list-style-type: none; padding-left: 1rem; margin: 1rem 0;">
            <li style="margin-bottom: 0.5rem;">🌿 Jot down your dreams and musings.</li>
            <li style="margin-bottom: 0.5rem;">🕊️ Let worries drift away like dandelion seeds.</li>
            <li>✨ Weave tales that spark joy and wonder.</li>
          </ul>
          We're so happy you're here, ready to explore the magic within you!
        </p>

        <!-- Signature -->
        <p style="font-size: 0.95rem; color: #6D8299; font-style: italic; border-top: 1px dashed #E8C7C7; padding-top: 1rem; text-align: right;">
          With a sprinkle of stardust,  
          <br>The Cozy Minds Team
        </p>
      </div>
    `,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  recipients: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      read: {
        type: Boolean,
        default: false,
      },
    },
  ],
});

export default mongoose.model("Mail", mailSchema);
