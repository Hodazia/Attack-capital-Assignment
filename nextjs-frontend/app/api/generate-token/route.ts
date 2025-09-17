


import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";


const livekithost = process.env.LIVEKIT_URL
const livekitsecret = process.env.LIVEKIT_API_SECRET
const livekitApi = process.env.LIVEKIT_API_KEY 


const createaccesstoken = async (userinfo: { identity:string; name?: string}, grant:any) => {
    const accesstoken = new AccessToken(livekitApi, livekitsecret, userinfo)
    accesstoken.addGrant(grant)
    return await accesstoken.toJwt()
}

export async function GET(request:NextRequest)
{
    try{
        const userId = new URL(request.url).searchParams.get('userid')
        console.log(userId)
        if(!userId)
        {
            throw Error("error no user id")
        }

        const roomName = uuid();
        if(!livekithost){
            throw Error("Missing env variable! ")
        }

        const roomClient =  new RoomServiceClient(livekithost,livekitApi,livekitsecret)

        const room = await roomClient.createRoom({
            name:roomName
        })

        const grant = {
            room: roomName,
            roomJoin: true,
            canPublish:true,
            canPublishData:true,
            canSubscribe:true,
            canUpdateOwnMetadata:true
        }

        const token = await createaccesstoken({
            identity:userId, 
            name:userId
        }, grant)
        return NextResponse.json({ roomName, token}, { status:200})

    }
    catch(error)
    {
        console.log("Error ", error);
    }

}