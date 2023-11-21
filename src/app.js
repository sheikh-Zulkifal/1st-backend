import express from express
import cors from cors
import cookieParser from cookieParser

 const app = express()
 app.use(cors({
    origin: process.env.Cors_Origin,
    Credential: true
 }))
 app.use(express.json({limit: "16kb"}))
 app.use(express.urlencoded({extended:true, limit: "16kb"}))
 app.use(express.static("public"))
 app.use(cookieParser())

 export {app}
