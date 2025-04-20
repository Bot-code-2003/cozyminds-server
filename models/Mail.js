import mongoose from "mongoose";

const mailSchema = new mongoose.Schema({
  sender: {
    type: String,
    required: true,
    default: "Developer",
  },
  title: {
    type: String,
    required: true,
    default: "Hi there, you’re safe here",
  },
  content: {
    type: String,
    required: true,
    default: `
      <div style="padding: 1.5rem; background-color: #F4FBEA; color: #3E4E3D; font-family: 'Georgia', serif; line-height: 1.7; border: 2px solid #D4E5C3; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.03); position: relative;">
  <div style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background-color: #F4FBEA; padding: 0 10px; color: #A3C398; font-size: 1.2rem;">🌿</div>

  <h1 style="font-size: 1.4rem; color: #7CA280; font-weight: 600; margin-bottom: 1.2rem; text-align: center; font-family: 'Courier New', monospace;">
    Hi there, you’re safe here 🍃
  </h1>

  <p style="font-size: 1rem; margin-bottom: 1.2rem;">
    I made this as a quiet little place for myself — to write, reflect, and gently learn.  
    Now it’s here for you too.  
    There’s no pressure. Just a calm space to pause and listen to your day.
    <br><br>
    Your words stay yours. Always private, always respected.  
    Cozy Minds is for anyone who wants to try journaling — even if it’s your very first time.
  </p>

  <p style="font-size: 0.95rem; color: #6B816B; font-style: italic; border-top: 1px dashed #D4E5C3; padding-top: 1rem; text-align: right;">
    With care,  
    <br>Developer
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
